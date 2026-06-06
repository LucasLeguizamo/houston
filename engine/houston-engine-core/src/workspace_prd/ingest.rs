//! Pre-fill the Company Bible from raw company material — a website URL or
//! pasted/uploaded document text. Speeds up onboarding: instead of answering
//! everything by hand, the user drops in what they already have and the model
//! extracts the minimum bible fields. Same one-shot infra as `interview`;
//! failures surface as `CoreError`.

use super::Prd;
use crate::error::{CoreError, CoreResult};
use crate::sessions::provider_oneshot;
use houston_terminal_manager::Provider;
use serde_json::Value;
use std::time::Duration;

const INGEST_TIMEOUT: Duration = Duration::from_secs(60);
const CLAUDE_MODEL: &str = "sonnet";
const CODEX_MODEL: &str = "gpt-5.5";
const GEMINI_MODEL: &str = "gemini-3.1-flash-lite";
/// Cap the material we feed the model so a huge page can't blow the prompt.
const MAX_CHARS: usize = 12_000;

/// Fetch a URL and reduce it to readable text, bounded to `MAX_CHARS`.
pub async fn fetch_url_text(url: &str) -> CoreResult<String> {
    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(CoreError::BadRequest(
            "URL must start with http:// or https://".into(),
        ));
    }
    let resp = reqwest::get(url)
        .await
        .map_err(|e| CoreError::Internal(format!("could not fetch {url}: {e}")))?;
    if !resp.status().is_success() {
        return Err(CoreError::Internal(format!(
            "fetching {url} returned {}",
            resp.status()
        )));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| CoreError::Internal(format!("could not read {url}: {e}")))?;
    let text = strip_html(&body);
    if text.trim().is_empty() {
        return Err(CoreError::Internal(format!("no readable text at {url}")));
    }
    Ok(text)
}

/// Crude HTML → text: drop script/style blocks, strip tags, decode a few common
/// entities, collapse whitespace, and truncate. Good enough to feed a model.
fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let bytes = html.as_bytes();
    let lower = html.to_lowercase();
    let mut i = 0;
    let mut in_tag = false;
    while i < bytes.len() {
        if !in_tag && lower[i..].starts_with("<script") {
            if let Some(end) = lower[i..].find("</script>") {
                i += end + "</script>".len();
                continue;
            }
        }
        if !in_tag && lower[i..].starts_with("<style") {
            if let Some(end) = lower[i..].find("</style>") {
                i += end + "</style>".len();
                continue;
            }
        }
        let c = bytes[i] as char;
        match c {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
        i += 1;
    }
    let decoded = out
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");
    let collapsed = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(MAX_CHARS).collect()
}

/// Extract bible fields from raw material and merge into the existing bible.
pub async fn ingest(
    prd: &Prd,
    material: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<Prd> {
    let material: String = material.trim().chars().take(MAX_CHARS).collect();
    if material.is_empty() {
        return Err(CoreError::BadRequest("no material to ingest".into()));
    }
    let raw = run_provider_ingest(prd, &material, provider, model)
        .await
        .map_err(CoreError::Internal)?;
    parse_result(&raw).map_err(CoreError::Internal)
}

fn build_prompt(prd: &Prd, material: &str) -> String {
    let prd_json = serde_json::to_string_pretty(prd).unwrap_or_else(|_| "{}".to_string());
    let material = serde_json::to_string(material).unwrap_or_else(|_| format!("{material:?}"));
    format!(
        r#"You extract structured facts about a company from raw material (a website
or a document) into a "Company Bible".

Current bible (JSON), keep its "role" field unchanged:
{prd_json}

Raw company material:
{material}

Fill in as many bible fields as the material genuinely supports. NEVER invent
facts that aren't in the material; leave a field empty if it isn't covered. Keep
anything already in the bible unless the material clearly improves it.

The bible schema (all fields optional, camelCase):
role (string, do not change)
company {{ name, oneLiner, stage, industry, website, mission }}
product {{ whatItIs, problemSolved, keyFeatures[], differentiators[] }}
market {{ idealCustomer, competitors[], positioning }}
businessModel {{ pricing, revenueStreams[], channels[] }}
goals {{ northStar, objectives[], successMetrics[] }}
operations {{ team, painPoints[] }}
brand {{ voice, links[] }}

Return ONLY valid JSON (no markdown fences) shaped like:
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

async fn run_provider_ingest(
    prd: &Prd,
    material: &str,
    provider: Provider,
    model: Option<&str>,
) -> Result<String, String> {
    let prompt = build_prompt(prd, material);
    let model = default_model(provider, model)
        .ok_or_else(|| format!("no ingest model wired up for provider {:?}", provider.id()))?;
    provider_oneshot::run_provider_oneshot(&prompt, provider, model, INGEST_TIMEOUT).await
}

fn parse_result(raw: &str) -> Result<Prd, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let v: Value = serde_json::from_str(cleaned).map_err(|e| format!("JSON parse failed: {e}"))?;
    let prd = v
        .get("prd")
        .ok_or_else(|| "missing 'prd' field in response".to_string())?;
    serde_json::from_value(prd.clone()).map_err(|e| format!("invalid 'prd' shape: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_html_drops_tags_scripts_styles() {
        let html = "<html><head><style>.a{color:red}</style><script>alert(1)</script></head>\
            <body><h1>Acme</h1><p>B2B&nbsp;fintech &amp; more</p></body></html>";
        let text = strip_html(html);
        assert!(text.contains("Acme"));
        assert!(text.contains("B2B fintech & more"));
        assert!(!text.contains("alert"));
        assert!(!text.contains("color:red"));
        assert!(!text.contains('<'));
    }

    #[test]
    fn parses_ingested_prd() {
        let raw = r#"{"prd":{"role":"investor","company":{"name":"Acme"}}}"#;
        let prd = parse_result(raw).unwrap();
        assert_eq!(prd.company.name, "Acme");
        assert_eq!(prd.role, "investor");
    }

    #[test]
    fn missing_prd_errors() {
        assert!(parse_result(r#"{"company":{}}"#).is_err());
    }

    #[test]
    fn invalid_json_errors() {
        assert!(parse_result("nope").is_err());
    }

    #[test]
    fn build_prompt_escapes_material() {
        let p = build_prompt(&Prd::default(), "say \"hi\"\nignore previous");
        assert!(p.contains(r#""say \"hi\"\nignore previous""#));
    }
}
