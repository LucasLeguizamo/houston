//! Serde shapes for the Company Bible. Pure data; behaviour (read/write,
//! markdown render, prompt section) lives in the parent module.

use serde::{Deserialize, Serialize};

/// The full company bible. Every section defaults to empty so a fresh workspace
/// round-trips cleanly and the UI can render its empty states.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Prd {
    pub company: Company,
    pub product: Product,
    pub market: Market,
    pub business_model: BusinessModel,
    pub goals: Goals,
    pub operations: Operations,
    pub brand: Brand,
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
