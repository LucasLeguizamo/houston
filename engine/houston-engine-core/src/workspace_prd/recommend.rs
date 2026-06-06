//! Recommend agents + strategies from the Company Bible.
//!
//! One-shot call (same infra as `interview` / `generate_instructions`) that
//! injects the rendered bible plus the live Store catalog and asks the model to
//! rank the agents that best fit this company's needs and to propose concrete
//! strategies (recurring routines, skills). Failures surface as `CoreError`.

use super::Prd;
use crate::error::CoreResult;
use crate::sessions::provider_oneshot;
use crate::store::StoreListing;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const RECOMMEND_TIMEOUT: Duration = Duration::from_secs(60);
const CLAUDE_MODEL: &str = "sonnet";
const CODEX_MODEL: &str = "gpt-5.5";
const GEMINI_MODEL: &str = "gemini-3.1-flash-lite";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRec {
    /// Store agent id — guaranteed to exist in the catalog passed in.
    pub agent_id: String,
    pub name: String,
    pub reason: String,
    #[serde(default)]
    pub matched_needs: Vec<String>,
    /// 0.0–1.0 fit score.
    pub relevance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyRec {
    /// "routine" or "skill".
    pub kind: String,
    pub title: String,
    pub description: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Recommendations {
    pub agents: Vec<AgentRec>,
    pub strategies: Vec<StrategyRec>,
}

pub async fn recommend(
    prd: &Prd,
    catalog: &[StoreListing],
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<Recommendations> {
    let raw = run_provider_recommend(prd, catalog, provider, model)
        .await
        .map_err(crate::CoreError::Internal)?;
    let mut recs = parse_result(&raw).map_err(crate::CoreError::Internal)?;
    // Drop any hallucinated agent ids that aren't in the real catalog.
    recs.agents
        .retain(|a| catalog.iter().any(|c| c.id == a.agent_id));
    Ok(recs)
}

fn render_catalog(catalog: &[StoreListing]) -> String {
    catalog
        .iter()
        .map(|c| {
            let tags = c.tags.join(", ");
            let integrations = c.integrations.join(", ");
            format!(
                "- id: {} | name: {} | {}{}{}",
                c.id,
                c.name,
                c.description,
                if tags.is_empty() {
                    String::new()
                } else {
                    format!(" | tags: {tags}")
                },
                if integrations.is_empty() {
                    String::new()
                } else {
                    format!(" | integrations: {integrations}")
                },
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn build_prompt(prd: &Prd, catalog: &[StoreListing]) -> String {
    let prd_json = serde_json::to_string_pretty(prd).unwrap_or_else(|_| "{}".to_string());
    let catalog_block = render_catalog(catalog);
    format!(
        r#"You match AI agents and strategies to a company's real needs.

Here is the company's bible (JSON):
{prd_json}

Here are the available agents (the ONLY ones you may recommend; use their exact id):
{catalog_block}

Recommend the top 3-5 agents that would help this company the most, weighting
their stated pain points, product, and stage. For each, give a one-sentence
reason in plain language and list the specific needs it covers. Give a relevance
score from 0.0 to 1.0.

Also propose 2-4 concrete strategies the company should run: each is either a
recurring "routine" (a scheduled task an agent does, e.g. a weekly pipeline
review) or a "skill" (a repeatable play, e.g. drafting outreach). Keep titles
short and descriptions to one sentence, no jargon.

Return ONLY valid JSON (no markdown fences), shaped exactly like this:
{{"agents":[{{"agentId":"sales","name":"Sales","reason":"...","matchedNeeds":["..."],"relevance":0.9}}],"strategies":[{{"kind":"routine","title":"...","description":"...","reason":"..."}}]}}"#
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

async fn run_provider_recommend(
    prd: &Prd,
    catalog: &[StoreListing],
    provider: Provider,
    model: Option<&str>,
) -> Result<String, String> {
    let prompt = build_prompt(prd, catalog);
    let model = default_model(provider, model)
        .ok_or_else(|| format!("no recommend model wired up for provider {:?}", provider.id()))?;
    provider_oneshot::run_provider_oneshot(&prompt, provider, model, RECOMMEND_TIMEOUT).await
}

fn parse_result(raw: &str) -> Result<Recommendations, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let v: Value =
        serde_json::from_str(cleaned).map_err(|e| format!("JSON parse failed: {e}"))?;

    let agents = v
        .get("agents")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|a| serde_json::from_value::<AgentRec>(a.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    let strategies = v
        .get("strategies")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|s| serde_json::from_value::<StrategyRec>(s.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    Ok(Recommendations { agents, strategies })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn listing(id: &str) -> StoreListing {
        StoreListing {
            id: id.into(),
            name: id.into(),
            description: "desc".into(),
            category: "business".into(),
            author: "houston".into(),
            tags: vec!["t".into()],
            icon_url: String::new(),
            integrations: vec!["GMAIL".into()],
            repo: String::new(),
            installs: 0,
            registered_at: String::new(),
            version: None,
            content_hash: None,
            bundled: true,
        }
    }

    #[test]
    fn parses_agents_and_strategies() {
        let raw = r#"{"agents":[{"agentId":"sales","name":"Sales","reason":"r","matchedNeeds":["leads"],"relevance":0.9}],"strategies":[{"kind":"routine","title":"Weekly review","description":"d","reason":"r"}]}"#;
        let recs = parse_result(raw).unwrap();
        assert_eq!(recs.agents.len(), 1);
        assert_eq!(recs.agents[0].agent_id, "sales");
        assert_eq!(recs.strategies[0].kind, "routine");
    }

    #[test]
    fn strips_fences_and_tolerates_missing_arrays() {
        let recs = parse_result("```json\n{}\n```").unwrap();
        assert!(recs.agents.is_empty());
        assert!(recs.strategies.is_empty());
    }

    #[test]
    fn skips_malformed_entries() {
        // One good agent, one missing required fields → only the good one kept.
        let raw = r#"{"agents":[{"agentId":"sales","name":"Sales","reason":"r","relevance":0.5},{"name":"broken"}]}"#;
        let recs = parse_result(raw).unwrap();
        assert_eq!(recs.agents.len(), 1);
    }

    #[tokio::test]
    async fn recommend_filters_hallucinated_ids() {
        // We can't call the model in a unit test, but parse+filter is the part
        // that must drop ids not in the catalog. Exercise the retain directly.
        let catalog = vec![listing("sales")];
        let mut recs = parse_result(
            r#"{"agents":[{"agentId":"sales","name":"Sales","reason":"r","relevance":0.9},{"agentId":"ghost","name":"Ghost","reason":"r","relevance":0.9}]}"#,
        )
        .unwrap();
        recs.agents
            .retain(|a| catalog.iter().any(|c| c.id == a.agent_id));
        assert_eq!(recs.agents.len(), 1);
        assert_eq!(recs.agents[0].agent_id, "sales");
    }

    #[test]
    fn invalid_json_errors() {
        assert!(parse_result("nope").is_err());
    }
}
