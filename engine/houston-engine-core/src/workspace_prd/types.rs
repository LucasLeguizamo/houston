//! Serde shapes for the Company Bible. Pure data; behaviour (read/write,
//! markdown render, prompt section) lives in the parent module.

use serde::{Deserialize, Serialize};

/// The full company bible. Every section defaults to empty so a fresh workspace
/// round-trips cleanly and the UI can render its empty states.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Prd {
    /// The stakeholder perspective the bible is filled from (e.g. "founder",
    /// "investor", "pm"). Frames the interview's focus and the recommendations.
    /// Not company data, so it's excluded from the agent prompt section.
    pub role: String,
    pub company: Company,
    pub product: Product,
    pub market: Market,
    pub business_model: BusinessModel,
    pub goals: Goals,
    pub operations: Operations,
    pub brand: Brand,
    /// Agents created from this bible (shown attached in the right panel).
    #[serde(default)]
    pub agents: Vec<AgentLink>,
    /// Strategy tasks tracked for this bible (improve / operate + done state).
    #[serde(default)]
    pub strategies: Vec<StrategyTask>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Company {
    pub name: String,
    pub one_liner: String,
    pub stage: String,
    pub industry: String,
    pub website: String,
    pub mission: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Product {
    pub what_it_is: String,
    pub problem_solved: String,
    pub key_features: Vec<String>,
    pub differentiators: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Market {
    pub ideal_customer: String,
    pub competitors: Vec<String>,
    pub positioning: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct BusinessModel {
    pub pricing: String,
    pub revenue_streams: Vec<String>,
    pub channels: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Goals {
    pub north_star: String,
    pub objectives: Vec<String>,
    pub success_metrics: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Operations {
    pub team: String,
    /// The places it hurts today — the single strongest signal for which
    /// agents and strategies to recommend.
    pub pain_points: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Brand {
    pub voice: String,
    pub links: Vec<String>,
}

/// An agent created from this bible, kept so the right panel can show it as
/// permanently attached to this context.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentLink {
    pub id: String,
    pub name: String,
    /// Bible cards ("section.field") this agent owns.
    pub cards: Vec<String>,
}

/// A strategy task tracked on the bible. `goal` is "improve" (sharpen the PRD)
/// or "operate" (run the business on it); `done` drives the PRD progress.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct StrategyTask {
    pub id: String,
    /// "routine" or "skill".
    pub kind: String,
    /// "improve" or "operate".
    pub goal: String,
    pub title: String,
    pub description: String,
    pub done: bool,
}
