//! Two-call quick-insight interview for the Company Bible.
//!
//! Instead of a slow turn-per-question loop, the flow is:
//!   1. `generate_questions` — ONE call returns up to 10 tailored questions
//!      (each with tap-to-answer suggestions), based on the bible + any ingested
//!      material. The user answers them all locally, instantly.
//!   2. `apply_answers` — ONE call folds every answer into the bible at once.
//!
//! Same one-shot infra as the rest of `workspace_prd`; failures surface as
//! `CoreError` (no silent fallback).

use super::Prd;
use crate::error::CoreResult;
use crate::sessions::provider_oneshot;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(120);
const CLAUDE_MODEL: &str = "sonnet";
const CODEX_MODEL: &str = "gpt-5.5";
const GEMINI_MODEL: &str = "gemini-3.1-flash-lite";
/// Quick-insight cap.
const MAX_QUESTIONS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub question: String,
    #[serde(default)]
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub question: String,
    pub answer: String,
}

/// Generate up to 10 tailored questions in one call.
pub async fn generate_questions(
    prd: &Prd,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<Vec<Question>> {
    let raw = run(build_questions_prompt(prd), provider, model)
        .await
        .map_err(crate::CoreError::Internal)?;
    let mut qs = parse_questions(&raw).map_err(crate::CoreError::Internal)?;
    qs.truncate(MAX_QUESTIONS);
    Ok(qs)
}

/// Fold a full set of answers into the bible in one call.
pub async fn apply_answers(
    prd: &Prd,
    answers: &[Answer],
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<Prd> {
    let raw = run(build_apply_prompt(prd, answers), provider, model)
        .await
        .map_err(crate::CoreError::Internal)?;
    parse_prd(&raw).map_err(crate::CoreError::Internal)
}

fn build_questions_prompt(prd: &Prd) -> String {
    let prd_json = serde_json::to_string_pretty(prd).unwrap_or_else(|_| "{}".to_string());
    format!(
        r#"You are preparing a quick-insight interview to complete a company's "Company Bible".

Current bible (JSON). The "role" field is who you're talking to (founder,
investor, pm, ...); tailor questions to what that role cares about:
{prd_json}

Produce the {MAX_QUESTIONS} (or fewer) HIGHEST-IMPACT questions that would fill
the biggest gaps and make the bible useful enough to recommend agents and
strategies. Rules:
- Plain language, one sentence each, no jargon, no mention of files/JSON.
- NEVER ask about something the bible already answers — go deeper instead.
- For each question give 3-4 short example answers (max 6 words) that are
  SPECIFIC to THIS company based on what the bible/ingested material says,
  never generic placeholders.
- Order them most-important first. Fewer than {MAX_QUESTIONS} is fine if the
  bible is already strong.

Return ONLY valid JSON (no markdown fences):
{{"questions":[{{"question":"...","suggestions":["...","...","..."]}}]}}"#
    )
}

fn build_apply_prompt(prd: &Prd, answers: &[Answer]) -> String {
    let prd_json = serde_json::to_string_pretty(prd).unwrap_or_else(|_| "{}".to_string());
    let qa = serde_json::to_string_pretty(answers).unwrap_or_else(|_| "[]".to_string());
    format!(
        r#"Update a company's "Company Bible" with the answers from an interview.

Current bible (JSON), keep its "role" unchanged:
{prd_json}

Question/answer pairs:
{qa}

Fold every answer into the matching bible fields. Only use what the answers and
existing bible actually say — NEVER invent facts. Keep existing content unless an
answer clearly improves it. Skip blank answers.

The bible schema (all fields optional, camelCase):
role, company {{ name, oneLiner, stage, industry, website, mission }},
product {{ whatItIs, problemSolved, keyFeatures[], differentiators[] }},
market {{ idealCustomer, competitors[], positioning }},
businessModel {{ pricing, revenueStreams[], channels[] }},
goals {{ northStar, objectives[], successMetrics[] }},
operations {{ team, painPoints[] }}, brand {{ voice, links[] }}

Return ONLY valid JSON (no markdown fences):
{{"prd": {{ ...the full updated bible... }}}}"#
    )
}

fn default_model<'a>(provider: Provider, model_override: Option<&'a str>) -> Option<&'a str> {
    let default = match provider.id() {
        "anthropic" => CLAUDE_MODEL,
        "openai" => CODEX_MODEL,
        "gemini" => GEMINI_MODEL,
        _ => return None,
    };
    Some(model_override.unwrap_or(default))
}

async fn run(prompt: String, provider: Provider, model: Option<&str>) -> Result<String, String> {
    let model = default_model(provider, model)
        .ok_or_else(|| format!("no interview model wired up for provider {:?}", provider.id()))?;
    provider_oneshot::run_provider_oneshot(&prompt, provider, model, TIMEOUT).await
}

fn clean(raw: &str) -> &str {
    raw.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
}

fn parse_questions(raw: &str) -> Result<Vec<Question>, String> {
    let v: Value = serde_json::from_str(clean(raw)).map_err(|e| format!("JSON parse failed: {e}"))?;
    let arr = v
        .get("questions")
        .and_then(Value::as_array)
        .ok_or_else(|| "missing 'questions' array".to_string())?;
    Ok(arr
        .iter()
        .filter_map(|q| serde_json::from_value::<Question>(q.clone()).ok())
        .filter(|q| !q.question.trim().is_empty())
        .collect())
}

fn parse_prd(raw: &str) -> Result<Prd, String> {
    let v: Value = serde_json::from_str(clean(raw)).map_err(|e| format!("JSON parse failed: {e}"))?;
    let prd = v
        .get("prd")
        .ok_or_else(|| "missing 'prd' field in response".to_string())?;
    serde_json::from_value(prd.clone()).map_err(|e| format!("invalid 'prd' shape: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_questions_and_filters_blanks() {
        let raw = r#"{"questions":[{"question":"What do you sell?","suggestions":["Tickets","Events"]},{"question":"   "},{"question":"Who buys?"}]}"#;
        let qs = parse_questions(raw).unwrap();
        assert_eq!(qs.len(), 2);
        assert_eq!(qs[0].question, "What do you sell?");
        assert_eq!(qs[0].suggestions, vec!["Tickets", "Events"]);
        assert!(qs[1].suggestions.is_empty());
    }

    #[test]
    fn parses_questions_with_fences() {
        let qs = parse_questions("```json\n{\"questions\":[{\"question\":\"Q?\"}]}\n```").unwrap();
        assert_eq!(qs.len(), 1);
    }

    #[test]
    fn missing_questions_errors() {
        assert!(parse_questions(r#"{"foo":1}"#).is_err());
    }

    #[test]
    fn parses_applied_prd() {
        let prd = parse_prd(r#"{"prd":{"role":"founder","company":{"name":"FreeTicket"}}}"#).unwrap();
        assert_eq!(prd.company.name, "FreeTicket");
        assert_eq!(prd.role, "founder");
    }

    #[test]
    fn missing_prd_errors() {
        assert!(parse_prd(r#"{"company":{}}"#).is_err());
    }

    #[test]
    fn invalid_json_errors() {
        assert!(parse_questions("nope").is_err());
        assert!(parse_prd("nope").is_err());
    }

    #[test]
    fn apply_prompt_includes_answers() {
        let answers = vec![Answer {
            question: "What do you sell?".into(),
            answer: "Event tickets".into(),
        }];
        let p = build_apply_prompt(&Prd::default(), &answers);
        assert!(p.contains("Event tickets"));
        assert!(p.contains("What do you sell?"));
    }

    #[test]
    fn default_model_per_provider() {
        let a: Provider = "anthropic".parse().unwrap();
        assert_eq!(default_model(a, None), Some(CLAUDE_MODEL));
        assert_eq!(default_model(a, Some("opus")), Some("opus"));
    }
}
