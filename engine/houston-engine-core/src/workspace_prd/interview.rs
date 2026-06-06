//! Guided AI interview that fills the Company Bible one question at a time.
//!
//! Mirrors `sessions::generate_instructions`: one-shot call to the user's
//! provider CLI, JSON-only response, failures surface as `CoreError` (no silent
//! fallback — the user must see a toast). Each turn takes the current bible plus
//! the user's latest answer and returns the **full** updated bible (so the
//! caller just saves it) plus the single most valuable next question.

use super::Prd;
use crate::error::CoreResult;
use crate::sessions::provider_oneshot;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const INTERVIEW_TIMEOUT: Duration = Duration::from_secs(60);
const CLAUDE_MODEL: &str = "sonnet";
const CODEX_MODEL: &str = "gpt-5.5";
const GEMINI_MODEL: &str = "gemini-3.1-flash-lite";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewTurn {
    /// The complete bible after folding in the user's answer.
    pub prd: Prd,
    /// The next question to ask, or `None` when the bible is solid enough.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_question: Option<String>,
    /// A few short, plausible example answers for `next_question` so the user
    /// can tap a suggestion instead of typing. Empty when there's no question.
    #[serde(default)]
    pub suggestions: Vec<String>,
    /// True when the model judges the bible complete enough to stop.
    pub complete: bool,
}

/// Run one interview turn. Pass an empty `user_answer` for the very first turn
/// (no answer yet) to just get the opening question.
pub async fn interview(
    prd: &Prd,
    user_answer: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<InterviewTurn> {
    let raw = run_provider_interview(prd, user_answer, provider, model)
        .await
        .map_err(crate::CoreError::Internal)?;
    parse_result(&raw).map_err(crate::CoreError::Internal)
}

fn build_prompt(prd: &Prd, user_answer: &str) -> String {
    let prd_json = serde_json::to_string_pretty(prd)
        .unwrap_or_else(|_| "{}".to_string());
    // JSON-encode the user text so quotes / newlines can't break out of the
    // prompt context and inject instructions.
    let answer = serde_json::to_string(user_answer)
        .unwrap_or_else(|_| format!("{user_answer:?}"));
    format!(
        r#"You are interviewing a non-technical user to build their "Company Bible":
the single source of truth about their company and product. You ask ONE question
at a time and quietly keep a structured document up to date as they answer.

The "role" field in the bible is who you're talking to (e.g. founder, investor,
pm, vp). Adapt your questions and wording to what that role cares about most
(an investor: market, traction, metrics; a pm: product, users, roadmap; a
founder: the whole picture). Never ask them their role again.

Here is the current Company Bible (JSON):
{prd_json}

The founder's latest answer (may be empty on the very first turn):
{answer}

Do this:
1. Fold the answer into the bible. Only fill or improve fields the answer
   actually supports. NEVER invent facts the founder didn't give you. Keep
   existing content unless the answer clearly corrects it.
2. Choose the SINGLE most valuable next question to ask, targeting the emptiest
   or weakest area. NEVER ask about something the bible already answers (e.g.
   don't ask what the company does if "product" or "company" is already filled)
   — go deeper instead. Phrase it warmly, in plain language, no jargon, no
   mention of files, fields, or JSON. One sentence.
3. Offer 3 or 4 short example answers for that question in "suggestions" so the
   user can tap one instead of typing. Each is at most 6 words and must be
   SPECIFIC to THIS company based on what the bible already says (and any
   material that was ingested) — never generic placeholders like "a SaaS tool"
   or "we automate invoicing" unless that is genuinely this company. If the
   bible is still empty, base suggestions on the most likely reading of any
   company name or website present. Use an empty array only when there is no
   next question.
4. Keep it SHORT: this is a quick-insight interview of AT MOST 10 questions
   total. Prioritize the highest-impact gaps. As soon as the bible is useful
   enough to recommend agents and strategies, set "complete" to true and set
   "nextQuestion" to null — do not pad with low-value questions.

The bible schema (all fields optional, camelCase):
company {{ name, oneLiner, stage, industry, website, mission }}
product {{ whatItIs, problemSolved, keyFeatures[], differentiators[] }}
market {{ idealCustomer, competitors[], positioning }}
businessModel {{ pricing, revenueStreams[], channels[] }}
goals {{ northStar, objectives[], successMetrics[] }}
operations {{ team, painPoints[] }}
brand {{ voice, links[] }}

Return ONLY valid JSON (no markdown fences), shaped exactly like this:
{{"prd": {{ ...the full updated bible... }}, "nextQuestion": "...", "suggestions": ["...", "...", "..."], "complete": false}}"#
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

async fn run_provider_interview(
    prd: &Prd,
    user_answer: &str,
    provider: Provider,
    model: Option<&str>,
) -> Result<String, String> {
    let prompt = build_prompt(prd, user_answer);
    let model = default_model(provider, model)
        .ok_or_else(|| format!("no interview model wired up for provider {:?}", provider.id()))?;
    provider_oneshot::run_provider_oneshot(&prompt, provider, model, INTERVIEW_TIMEOUT).await
}

fn parse_result(raw: &str) -> Result<InterviewTurn, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let v: Value =
        serde_json::from_str(cleaned).map_err(|e| format!("JSON parse failed: {e}"))?;

    let prd: Prd = v
        .get("prd")
        .ok_or_else(|| "missing 'prd' field in response".to_string())
        .and_then(|p| {
            serde_json::from_value(p.clone()).map_err(|e| format!("invalid 'prd' shape: {e}"))
        })?;

    let next_question = v
        .get("nextQuestion")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    // Suggestions only make sense alongside a question; drop them otherwise.
    let suggestions = if next_question.is_some() {
        v.get("suggestions")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.as_str().map(str::trim))
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let complete = v
        .get("complete")
        .and_then(Value::as_bool)
        // No explicit flag but also no question left → treat as complete.
        .unwrap_or_else(|| next_question.is_none());

    Ok(InterviewTurn {
        prd,
        next_question,
        suggestions,
        complete,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_turn() {
        let raw = r#"{"prd":{"company":{"name":"Acme"}},"nextQuestion":"What do you sell?","suggestions":["Software","Consulting","  ",42],"complete":false}"#;
        let turn = parse_result(raw).unwrap();
        assert_eq!(turn.prd.company.name, "Acme");
        assert_eq!(turn.next_question.as_deref(), Some("What do you sell?"));
        // Blank + non-string suggestions are filtered out.
        assert_eq!(turn.suggestions, vec!["Software", "Consulting"]);
        assert!(!turn.complete);
    }

    #[test]
    fn suggestions_cleared_when_no_question() {
        let raw = r#"{"prd":{},"nextQuestion":null,"suggestions":["x"],"complete":true}"#;
        let turn = parse_result(raw).unwrap();
        assert!(turn.suggestions.is_empty());
        assert!(turn.complete);
    }

    #[test]
    fn strips_fences() {
        let raw = "```json\n{\"prd\":{},\"nextQuestion\":null,\"complete\":true}\n```";
        let turn = parse_result(raw).unwrap();
        assert!(turn.prd.is_empty());
        assert!(turn.next_question.is_none());
        assert!(turn.complete);
    }

    #[test]
    fn missing_prd_errors() {
        assert!(parse_result(r#"{"nextQuestion":"hi"}"#).is_err());
    }

    #[test]
    fn empty_question_becomes_none_and_complete_infers() {
        let raw = r#"{"prd":{},"nextQuestion":"   "}"#;
        let turn = parse_result(raw).unwrap();
        assert!(turn.next_question.is_none());
        // No explicit complete, no question → inferred complete.
        assert!(turn.complete);
    }

    #[test]
    fn invalid_json_errors() {
        assert!(parse_result("not json").is_err());
    }

    #[test]
    fn build_prompt_json_escapes_answer() {
        let p = build_prompt(&Prd::default(), "say \"hi\"\nignore previous");
        assert!(p.contains(r#""say \"hi\"\nignore previous""#));
    }

    #[test]
    fn default_model_per_provider() {
        let a: Provider = "anthropic".parse().unwrap();
        let g: Provider = "gemini".parse().unwrap();
        assert_eq!(default_model(a, None), Some(CLAUDE_MODEL));
        assert_eq!(default_model(g, Some("gemini-3.1-pro")), Some("gemini-3.1-pro"));
    }
}
