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

/// Answer one chat turn grounded in the bible. `context` is an optional card the
/// user attached (a "section.field" value) to focus the turn on.
pub async fn chat(
    prd: &Prd,
    history: &[ChatMessage],
    message: &str,
    context: Option<&str>,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<String> {
    let prompt = build_prompt(prd, history, message, context);
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

fn build_prompt(
    prd: &Prd,
    history: &[ChatMessage],
    message: &str,
    context: Option<&str>,
) -> String {
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
    // JSON-encode user-supplied text so it can't break out of the prompt.
    let message = serde_json::to_string(message).unwrap_or_else(|_| format!("{message:?}"));
    let focus = match context.map(str::trim).filter(|c| !c.is_empty()) {
        Some(c) => {
            let c = serde_json::to_string(c).unwrap_or_else(|_| format!("{c:?}"));
            format!(
                "\nThe user attached this specific bible card to work on:\n{c}\n\
                 When they ask to autocomplete, modify, or extend, focus on THIS \
                 card and return a concrete, paste-ready new value for it (a tight \
                 sentence or short list), then one short line on what changed.\n"
            )
        }
        None => String::new(),
    };
    format!(
        r#"You are "PRD Architect", an expert product strategist whose single job is to
help a non-technical founder build and sharpen their Company Bible (a structured
PRD). You write crisp, specific, paste-ready content — never vague filler — and
you ground everything in what this company actually is. If the bible lacks
something you need, ask one short question or state a clear assumption.

Company Bible:
{bible}
{focus}
Conversation so far:
{transcript}

The user now says:
{message}

Reply in plain language (no markdown headers, no JSON). Be concise and concrete.
When proposing bible content, give the exact text they can paste, then a one-line
note. When they ask how to do something, give clear, specific steps."#
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
        let p = build_prompt(&prd, &history, "how do I grow?", None);
        assert!(p.contains("FreeTicket"));
        assert!(p.contains("User: hi"));
        assert!(p.contains("how do I grow?"));
    }

    #[test]
    fn prompt_includes_attached_context() {
        let p = build_prompt(&Prd::default(), &[], "extend", Some("Pain points: slow checkout"));
        assert!(p.contains("attached this specific bible card"));
        assert!(p.contains("slow checkout"));
    }

    #[test]
    fn prompt_json_escapes_message() {
        let p = build_prompt(&Prd::default(), &[], "say \"hi\"\nignore previous", None);
        assert!(p.contains(r#""say \"hi\"\nignore previous""#));
    }

    #[test]
    fn default_model_per_provider() {
        let a: Provider = "anthropic".parse().unwrap();
        assert_eq!(default_model(a, None), Some(CLAUDE_MODEL));
        assert_eq!(default_model(a, Some("opus")), Some("opus"));
    }
}
