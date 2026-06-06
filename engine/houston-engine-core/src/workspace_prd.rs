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
//! Stored as `PRD.json` at the root of the workspace directory, next to
//! `WORKSPACE.md` / `USER.md`. Like `workspace_context`, writes do not emit a
//! `HoustonEvent`: the file lives at the workspace root (outside the per-agent
//! file-watcher), so the UI stays in sync by invalidating its own query on the
//! mutation that wrote it. Changes take effect on the **next** chat — running
//! sessions keep the copy baked into their prompt at spawn.

use crate::error::{CoreError, CoreResult};
use std::fs;
use std::path::{Path, PathBuf};

pub mod interview;
pub mod recommend;
mod types;

pub use types::{BusinessModel, Brand, Company, Goals, Market, Operations, Prd, Product};

pub const PRD_JSON: &str = "PRD.json";

fn prd_path(ws_dir: &Path) -> PathBuf {
    ws_dir.join(PRD_JSON)
}

/// Read the workspace's PRD. A missing file is a brand-new, empty bible.
/// A present-but-corrupt file is surfaced as an error rather than silently
/// dropped, so the user gets a toast instead of losing their work.
pub fn read(ws_dir: &Path) -> CoreResult<Prd> {
    let path = prd_path(ws_dir);
    let contents = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Prd::default()),
        Err(e) => return Err(CoreError::Internal(format!("failed to read {PRD_JSON}: {e}"))),
    };
    if contents.trim().is_empty() {
        return Ok(Prd::default());
    }
    serde_json::from_str(&contents)
        .map_err(|e| CoreError::Internal(format!("failed to parse {PRD_JSON}: {e}")))
}

/// Overwrite the workspace's PRD.
pub fn write(ws_dir: &Path, prd: &Prd) -> CoreResult<()> {
    fs::create_dir_all(ws_dir)?;
    let body = serde_json::to_string_pretty(prd)
        .map_err(|e| CoreError::Internal(format!("failed to serialize {PRD_JSON}: {e}")))?;
    fs::write(prd_path(ws_dir), body)
        .map_err(|e| CoreError::Internal(format!("failed to write {PRD_JSON}: {e}")))?;
    Ok(())
}

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

/// Build the prompt section the engine appends to every agent's system prompt.
///
/// Returns `None` when `ws_dir` isn't a real workspace (no `.houston/`) or the
/// bible is still empty — an empty bible adds nothing to the prompt.
pub fn build_prompt_section(ws_dir: &Path) -> Option<String> {
    if !ws_dir.join(".houston").exists() {
        return None;
    }
    let prd = read(ws_dir).ok()?;
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

    #[test]
    fn read_returns_empty_when_file_absent() {
        let d = TempDir::new().unwrap();
        let prd = read(d.path()).unwrap();
        assert!(prd.is_empty());
    }

    #[test]
    fn write_round_trips() {
        let d = TempDir::new().unwrap();
        write(d.path(), &sample()).unwrap();
        let prd = read(d.path()).unwrap();
        assert_eq!(prd.company.name, "Acme");
        assert_eq!(prd.operations.pain_points[0], "slow invoicing");
    }

    #[test]
    fn corrupt_file_surfaces_error() {
        let d = TempDir::new().unwrap();
        fs::write(d.path().join(PRD_JSON), "{ not json").unwrap();
        assert!(read(d.path()).is_err());
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
    fn build_prompt_section_includes_content() {
        let d = TempDir::new().unwrap();
        fs::create_dir_all(d.path().join(".houston")).unwrap();
        write(d.path(), &sample()).unwrap();
        let out = build_prompt_section(d.path()).unwrap();
        assert!(out.contains("# Company Bible"));
        assert!(out.contains("Company: Acme"));
    }

    #[test]
    fn build_prompt_section_none_when_empty() {
        let d = TempDir::new().unwrap();
        fs::create_dir_all(d.path().join(".houston")).unwrap();
        // No PRD.json written → empty bible → no section.
        assert!(build_prompt_section(d.path()).is_none());
    }

    #[test]
    fn build_prompt_section_none_outside_workspace() {
        let d = TempDir::new().unwrap();
        write(d.path(), &sample()).unwrap();
        // No `.houston/` => not a real workspace.
        assert!(build_prompt_section(d.path()).is_none());
    }
}
