//! Workspace-level Product Requirements Document — the "Company Bible".
//!
//! A single structured document per workspace that captures everything about
//! the company / product: who they are, what they build, who they serve, how
//! they make money, where they're going, and where it hurts. It is the curated,
//! deliberately-filled counterpart to `WORKSPACE.md` (the free-form scratchpad
//! the agent jots facts into): the Bible is built through a guided AI interview
//! and is the source of truth that (a) gets appended to every agent's system
//! prompt at session start and (b) drives agent + strategy recommendations.
//!
//! A workspace can hold several context bibles (see `library`), stored together
//! in `prd/bibles.json` at the workspace root. One is active; the active bible is
//! what gets appended to every agent's system prompt at session start. Writes do
//! not emit a `HoustonEvent` (the file is outside the per-agent watcher); the UI
//! stays in sync by invalidating its own query on the mutation that wrote it.

use crate::error::CoreResult;
use std::path::{Path, PathBuf};

pub mod chat;
pub mod ingest;
pub mod interview;
pub mod library;
pub mod recommend;
mod types;

pub use types::{BusinessModel, Brand, Company, Goals, Market, Operations, Prd, Product};

/// Resolve a workspace directory by id under the given root. Delegates to
/// `workspace_context` so both surfaces share one resolution rule.
pub fn resolve_dir(root: &Path, id: &str) -> CoreResult<PathBuf> {
    crate::workspace_context::resolve_dir(root, id)
}

impl Prd {
    /// True when nothing has been captured yet — used to skip prompt injection
    /// and to gate the recommendation flow.
    pub fn is_empty(&self) -> bool {
        self.render_markdown().is_none()
    }

    /// Render the bible to a compact markdown block for the system prompt.
    /// Returns `None` when the document is entirely empty so callers can skip
    /// injecting an empty section. Long lists are bounded to keep every
    /// agent's system prompt small.
    fn render_markdown(&self) -> Option<String> {
        let mut out = String::new();

        field(&mut out, "Company", &self.company.name);
        field(&mut out, "One-liner", &self.company.one_liner);
        field(&mut out, "Stage", &self.company.stage);
        field(&mut out, "Industry", &self.company.industry);
        field(&mut out, "Website", &self.company.website);
        field(&mut out, "Mission", &self.company.mission);
        field(&mut out, "Product", &self.product.what_it_is);
        field(&mut out, "Problem solved", &self.product.problem_solved);
        list(&mut out, "Key features", &self.product.key_features);
        list(&mut out, "Differentiators", &self.product.differentiators);
        field(&mut out, "Ideal customer", &self.market.ideal_customer);
        list(&mut out, "Competitors", &self.market.competitors);
        field(&mut out, "Positioning", &self.market.positioning);
        field(&mut out, "Pricing", &self.business_model.pricing);
        list(&mut out, "Revenue streams", &self.business_model.revenue_streams);
        list(&mut out, "Channels", &self.business_model.channels);
        field(&mut out, "North star", &self.goals.north_star);
        list(&mut out, "Objectives", &self.goals.objectives);
        list(&mut out, "Success metrics", &self.goals.success_metrics);
        field(&mut out, "Team", &self.operations.team);
        list(&mut out, "Pain points", &self.operations.pain_points);
        field(&mut out, "Brand voice", &self.brand.voice);

        if out.is_empty() {
            None
        } else {
            Some(out)
        }
    }
}

/// Append a bullet for a scalar field if it has non-empty content.
fn field(out: &mut String, label: &str, value: &str) {
    let v = value.trim();
    if !v.is_empty() {
        out.push_str(&format!("- {label}: {v}\n"));
    }
}

/// Append a bounded bullet for a list field if it has any non-empty entries.
fn list(out: &mut String, label: &str, items: &[String]) {
    const MAX: usize = 8;
    let values: Vec<&str> = items
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .take(MAX)
        .collect();
    if !values.is_empty() {
        out.push_str(&format!("- {label}: {}\n", values.join("; ")));
    }
}

/// Build the prompt section the engine appends to every agent's system prompt,
/// from the workspace's ACTIVE bible.
///
/// Returns `None` when `ws_dir` isn't a real workspace (no `.houston/`) or the
/// active bible is still empty — an empty bible adds nothing to the prompt.
pub fn build_prompt_section(ws_dir: &Path) -> Option<String> {
    if !ws_dir.join(".houston").exists() {
        return None;
    }
    let prd = library::active_prd(ws_dir)?;
    let body = prd.render_markdown()?;
    let mut out = String::new();
    out.push_str("# Company Bible\n\n");
    out.push_str(
        "The curated source of truth about this company and its product. Use it \
         to ground every answer and decision. When the user shares something \
         that changes these facts, tell them you'll update the Company Bible.\n\n",
    );
    out.push_str(&body);
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn sample() -> Prd {
        Prd {
            company: Company {
                name: "Acme".into(),
                one_liner: "B2B fintech".into(),
                ..Default::default()
            },
            operations: Operations {
                pain_points: vec!["slow invoicing".into(), "".into()],
                ..Default::default()
            },
            ..Default::default()
        }
    }

    /// Create + activate a bible carrying `prd`, returning the workspace dir.
    fn ws_with_active(prd: Prd) -> TempDir {
        let d = TempDir::new().unwrap();
        fs::create_dir_all(d.path().join(".houston")).unwrap();
        let meta = library::create(d.path(), "Bible").unwrap();
        library::update(d.path(), &meta.id, &prd).unwrap();
        d
    }

    #[test]
    fn render_skips_empty_list_entries_and_bounds_lists() {
        let prd = sample();
        let md = prd.render_markdown().unwrap();
        assert!(md.contains("Company: Acme"));
        assert!(md.contains("Pain points: slow invoicing"));
        // The empty string in pain_points must not leak a trailing separator.
        assert!(!md.contains("slow invoicing; "));
    }

    #[test]
    fn build_prompt_section_includes_active_bible() {
        let d = ws_with_active(sample());
        let out = build_prompt_section(d.path()).unwrap();
        assert!(out.contains("# Company Bible"));
        assert!(out.contains("Company: Acme"));
    }

    #[test]
    fn build_prompt_section_none_when_empty() {
        let d = TempDir::new().unwrap();
        fs::create_dir_all(d.path().join(".houston")).unwrap();
        // No bibles created → nothing active → no section.
        assert!(build_prompt_section(d.path()).is_none());
    }

    #[test]
    fn build_prompt_section_none_outside_workspace() {
        let d = TempDir::new().unwrap();
        // No `.houston/` => not a real workspace, even with a bible on disk.
        library::create(d.path(), "Bible").unwrap();
        assert!(build_prompt_section(d.path()).is_none());
    }
}
