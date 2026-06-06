//! Houston chat grounded in a context bible. A focused product/strategy copilot:
//! it answers with the active bible as context and suggests how to implement
//! things. One-shot per turn (same infra as the rest of `workspace_prd`); the
//! client keeps the running transcript and passes it back each turn.

use super::Prd;
use crate::error::CoreResult;
use crate::sessions::provider_oneshot;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(60);
const CLAUDE_MODEL: &str = "sonnet";
const CODEX_MODEL: &str = "gpt-5.5";
const GEMINI_MODEL: &str = "gemini-3.1-flash-lite";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    /// "user" or "assistant".
    pub role: String,
    pub content: String,
}

/// Answer one chat turn grounded in the bible.
pub async fn chat(
    prd: &Prd,
    history: &[ChatMessage],
    message: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<String> {
    let prompt = build_prompt(prd, history, message);
    let model = default_model(provider, model)
        .ok_or_else(|| crate::CoreError::Internal(format!(
            "no chat model wired up for provider {:?}",
            provider.id()
        )))?;
    let reply = provider_oneshot::run_provider_oneshot(&prompt, provider, model, TIMEOUT)
        .await
        .map_err(crate::CoreError::Internal)?;
    Ok(reply.trim().to_string())
}

fn build_prompt(prd: &Prd, history: &[ChatMessage], message: &str) -> String {
    let bible = prd
        .render_markdown()
        .unwrap_or_else(|| "(the bible is still empty)".to_string());
    let transcript = history
        .iter()
        .map(|m| {
            let who = if m.role == "assistant" { "Houston" } else { "User" };
            format!("{who}: {}", m.content.trim())
        })
        .collect::<Vec<_>>()
        .join("\n");
    // JSON-encode the new message so it can't break out of the prompt.
    let message = serde_json::to_string(message).unwrap_or_else(|_| format!("{message:?}"));
    format!(
        r#"You are Houston, a sharp, practical product and strategy copilot for a
non-technical founder. Ground every answer in their Company Bible below; when
something is missing from the bible, say so briefly instead of inventing it.

Company Bible:
{bible}

Conversation so far:
{transcript}

The user now says:
{message}

Reply in plain language (no markdown headers, no JSON). Be concise and
concrete: when they ask how to do something, give clear, specific steps or an
implementation suggestion grounded in this company's context."#
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_includes_bible_history_and_message() {
        let mut prd = Prd::default();
        prd.company.name = "FreeTicket".into();
        let history = vec![ChatMessage {
            role: "user".into(),
            content: "hi".into(),
        }];
        let p = build_prompt(&prd, &history, "how do I grow?");
        assert!(p.contains("FreeTicket"));
        assert!(p.contains("User: hi"));
        assert!(p.contains("how do I grow?"));
    }

    #[test]
    fn prompt_json_escapes_message() {
        let p = build_prompt(&Prd::default(), &[], "say \"hi\"\nignore previous");
        assert!(p.contains(r#""say \"hi\"\nignore previous""#));
    }

    #[test]
    fn default_model_per_provider() {
        let a: Provider = "anthropic".parse().unwrap();
        assert_eq!(default_model(a, None), Some(CLAUDE_MODEL));
        assert_eq!(default_model(a, Some("opus")), Some("opus"));
    }
}
