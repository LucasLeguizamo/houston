//! `/v1/workspaces` REST routes.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, State},
    routing::{delete, get, patch, post},
    Json, Router,
};
use houston_engine_core::agents_crud::{self, Agent, CreateAgent, CreateAgentResult, UpdateAgent};
use houston_engine_core::workspace_context::{self, WorkspaceContext};
use houston_engine_core::workspace_prd::ingest::{fetch_url_text, ingest};
use houston_engine_core::workspace_prd::interview::{interview, InterviewTurn};
use houston_engine_core::workspace_prd::recommend::{recommend, Recommendations};
use houston_engine_core::workspace_prd::{self, Prd};
use houston_engine_core::workspaces::{self, CreateWorkspace, RenameWorkspace, Workspace};
use houston_engine_core::{store, CoreError};
use houston_terminal_manager::Provider;
use serde::Deserialize;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/workspaces", get(list).post(create))
        .route("/workspaces/:id", delete(remove))
        .route("/workspaces/:id/rename", post(rename))
        .route("/workspaces/:id/locale", patch(set_locale))
        .route(
            "/workspaces/:id/context",
            get(get_context).put(put_context),
        )
        // Company Bible (PRD) — workspace-level structured product/company doc.
        .route("/workspaces/:id/prd", get(get_prd).put(put_prd))
        .route("/workspaces/:id/prd/interview", post(prd_interview))
        .route("/workspaces/:id/prd/recommend", post(prd_recommend))
        .route("/workspaces/:id/prd/ingest", post(prd_ingest))
        // Workspace-scoped agents CRUD.
        .route(
            "/workspaces/:id/agents",
            get(list_agents).post(create_agent),
        )
        .route(
            "/workspaces/:id/agents/:agent_id",
            patch(update_agent).delete(delete_agent),
        )
        .route(
            "/workspaces/:id/agents/:agent_id/rename",
            post(rename_agent),
        )
}

async fn list(State(st): State<Arc<ServerState>>) -> Result<Json<Vec<Workspace>>, ApiError> {
    // `workspaces::list` does synchronous filesystem work (create_dir_all +
    // read the workspaces dir). This is the call the frontend's boot
    // `LanguageGate` makes on every launch, so a slow or contended disk read
    // must not block a tokio worker and starve other requests. Run it on a
    // blocking thread (gethouston/houston#439).
    let docs = st.engine.paths.docs().to_path_buf();
    let workspaces = tokio::task::spawn_blocking(move || workspaces::list(&docs))
        .await
        .map_err(|e| CoreError::Internal(format!("workspaces list task failed: {e}")))??;
    Ok(Json(workspaces))
}

async fn create(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<CreateWorkspace>,
) -> Result<Json<Workspace>, ApiError> {
    Ok(Json(workspaces::create(st.engine.paths.docs(), req)?))
}

async fn remove(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
) -> Result<(), ApiError> {
    workspaces::delete(st.engine.paths.docs(), &id)?;
    Ok(())
}

async fn rename(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(req): Json<RenameWorkspace>,
) -> Result<Json<Workspace>, ApiError> {
    Ok(Json(workspaces::rename(st.engine.paths.docs(), &id, req)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetWorkspaceLocale {
    /// BCP-47 base tag (`"en"` / `"es"` / `"pt"`). `null` or empty clears the
    /// per-workspace override so the workspace inherits the global `locale`.
    locale: Option<String>,
}

async fn set_locale(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(req): Json<SetWorkspaceLocale>,
) -> Result<Json<Workspace>, ApiError> {
    Ok(Json(workspaces::set_locale(
        st.engine.paths.docs(),
        &id,
        req.locale,
    )?))
}

async fn get_context(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
) -> Result<Json<WorkspaceContext>, ApiError> {
    let dir = workspace_context::resolve_dir(st.engine.paths.docs(), &id)?;
    Ok(Json(workspace_context::read(&dir)?))
}

async fn put_context(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(body): Json<WorkspaceContext>,
) -> Result<Json<WorkspaceContext>, ApiError> {
    let dir = workspace_context::resolve_dir(st.engine.paths.docs(), &id)?;
    workspace_context::write(&dir, &body)?;
    Ok(Json(workspace_context::read(&dir)?))
}

// -- Company Bible (PRD) --

/// Resolve the provider + model for a one-shot bible call. An explicit override
/// wins; otherwise fall back to `Provider::default()` (anthropic), matching the
/// `generate-instructions` handler in `sessions.rs`.
fn resolve_oneshot(
    provider: Option<String>,
    model: Option<String>,
) -> Result<(Provider, Option<String>), ApiError> {
    if let Some(p_str) = provider.as_deref() {
        let provider: Provider = p_str.parse().map_err(|e: String| CoreError::BadRequest(e))?;
        Ok((provider, model))
    } else {
        Ok((Provider::default(), model))
    }
}

async fn get_prd(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
) -> Result<Json<Prd>, ApiError> {
    let dir = workspace_prd::resolve_dir(st.engine.paths.docs(), &id)?;
    Ok(Json(workspace_prd::read(&dir)?))
}

async fn put_prd(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(body): Json<Prd>,
) -> Result<Json<Prd>, ApiError> {
    let dir = workspace_prd::resolve_dir(st.engine.paths.docs(), &id)?;
    workspace_prd::write(&dir, &body)?;
    Ok(Json(workspace_prd::read(&dir)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrdInterviewBody {
    /// The client's current in-memory bible (authoritative; the model folds the
    /// answer into it and returns the full updated copy for the client to save).
    prd: Prd,
    #[serde(default)]
    user_answer: String,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

async fn prd_interview(
    State(_st): State<Arc<ServerState>>,
    Path(_id): Path<String>,
    Json(body): Json<PrdInterviewBody>,
) -> Result<Json<InterviewTurn>, ApiError> {
    let (provider, model) = resolve_oneshot(body.provider, body.model)?;
    let turn = interview(&body.prd, &body.user_answer, provider, model.as_deref()).await?;
    Ok(Json(turn))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrdRecommendBody {
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

async fn prd_recommend(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(body): Json<PrdRecommendBody>,
) -> Result<Json<Recommendations>, ApiError> {
    let dir = workspace_prd::resolve_dir(st.engine.paths.docs(), &id)?;
    let prd = workspace_prd::read(&dir)?;
    let catalog = store::fetch_catalog().await?;
    let (provider, model) = resolve_oneshot(body.provider, body.model)?;
    let recs = recommend(&prd, &catalog, provider, model.as_deref()).await?;
    Ok(Json(recs))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrdIngestBody {
    /// The client's current bible (the merged copy is returned to be saved).
    prd: Prd,
    /// A website to fetch + extract, or raw document text. Exactly one is used:
    /// a non-empty `url` wins, otherwise `text`.
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

async fn prd_ingest(
    State(_st): State<Arc<ServerState>>,
    Path(_id): Path<String>,
    Json(body): Json<PrdIngestBody>,
) -> Result<Json<Prd>, ApiError> {
    let material = match body.url.as_deref().map(str::trim).filter(|u| !u.is_empty()) {
        Some(url) => fetch_url_text(url).await?,
        None => body
            .text
            .filter(|t| !t.trim().is_empty())
            .ok_or_else(|| CoreError::BadRequest("provide a url or document text".into()))?,
    };
    let (provider, model) = resolve_oneshot(body.provider, body.model)?;
    let merged = ingest(&body.prd, &material, provider, model.as_deref()).await?;
    Ok(Json(merged))
}

// -- Workspace-scoped agent CRUD --

async fn list_agents(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<Agent>>, ApiError> {
    Ok(Json(agents_crud::list(st.engine.paths.docs(), &id)?))
}

async fn create_agent(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateAgent>,
) -> Result<Json<CreateAgentResult>, ApiError> {
    Ok(Json(agents_crud::create(st.engine.paths.docs(), &id, req)?))
}

async fn delete_agent(
    State(st): State<Arc<ServerState>>,
    Path((id, agent_id)): Path<(String, String)>,
) -> Result<(), ApiError> {
    agents_crud::delete(st.engine.paths.docs(), &id, &agent_id)?;
    Ok(())
}

async fn update_agent(
    State(st): State<Arc<ServerState>>,
    Path((id, agent_id)): Path<(String, String)>,
    Json(req): Json<UpdateAgent>,
) -> Result<Json<Agent>, ApiError> {
    Ok(Json(agents_crud::update(
        st.engine.paths.docs(),
        &id,
        &agent_id,
        req,
    )?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameAgentBody {
    new_name: String,
}

async fn rename_agent(
    State(st): State<Arc<ServerState>>,
    Path((id, agent_id)): Path<(String, String)>,
    Json(body): Json<RenameAgentBody>,
) -> Result<Json<Agent>, ApiError> {
    Ok(Json(agents_crud::rename(
        st.engine.paths.docs(),
        &id,
        &agent_id,
        &body.new_name,
    )?))
}
