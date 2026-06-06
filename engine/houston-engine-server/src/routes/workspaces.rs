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
use houston_engine_core::workspace_prd::chat::{chat as prd_chat_fn, ChatMessage};
use houston_engine_core::workspace_prd::ingest::{fetch_url_text, ingest};
use houston_engine_core::workspace_prd::interview::{
    apply_answers, generate_questions, Answer, Question,
};
use houston_engine_core::workspace_prd::recommend::{recommend, Recommendations};
use houston_engine_core::workspace_prd::library::{self, BibleList, BibleMeta};
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
        // Company Bibles — a workspace can hold several; one is active.
        .route("/workspaces/:id/prd/bibles", get(list_bibles).post(create_bible))
        .route(
            "/workspaces/:id/prd/bibles/:bible_id",
            get(get_bible).put(put_bible).delete(delete_bible),
        )
        .route(
            "/workspaces/:id/prd/bibles/:bible_id/activate",
            post(activate_bible),
        )
        // Bible AI flows (operate on a bible passed in the body).
        .route("/workspaces/:id/prd/questions", post(prd_questions))
        .route("/workspaces/:id/prd/answers", post(prd_answers))
        .route("/workspaces/:id/prd/recommend", post(prd_recommend))
        .route("/workspaces/:id/prd/ingest", post(prd_ingest))
        .route("/workspaces/:id/prd/chat", post(prd_chat))
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

async fn list_bibles(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
) -> Result<Json<BibleList>, ApiError> {
    let dir = workspace_prd::resolve_dir(st.engine.paths.docs(), &id)?;
    Ok(Json(library::list(&dir)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBibleBody {
    name: String,
}

async fn create_bible(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Json(body): Json<CreateBibleBody>,
) -> Result<Json<BibleMeta>, ApiError> {
    let dir = workspace_prd::resolve_dir(st.engine.paths.docs(), &id)?;
    Ok(Json(library::create(&dir, &body.name)?))
}

async fn get_bible(
    State(st): State<Arc<ServerState>>,
    Path((id, bible_id)): Path<(String, String)>,
) -> Result<Json<Prd>, ApiError> {
    let dir = workspace_prd::resolve_dir(st.engine.paths.docs(), &id)?;
    Ok(Json(library::get(&dir, &bible_id)?))
}

async fn put_bible(
    State(st): State<Arc<ServerState>>,
    Path((id, bible_id)): Path<(String, String)>,
    Json(body): Json<Prd>,
) -> Result<Json<Prd>, ApiError> {
    let dir = workspace_prd::resolve_dir(st.engine.paths.docs(), &id)?;
    Ok(Json(library::update(&dir, &bible_id, &body)?))
}

async fn delete_bible(
    State(st): State<Arc<ServerState>>,
    Path((id, bible_id)): Path<(String, String)>,
) -> Result<(), ApiError> {
    let dir = workspace_prd::resolve_dir(st.engine.paths.docs(), &id)?;
    library::delete(&dir, &bible_id)?;
    Ok(())
}

async fn activate_bible(
    State(st): State<Arc<ServerState>>,
    Path((id, bible_id)): Path<(String, String)>,
) -> Result<(), ApiError> {
    let dir = workspace_prd::resolve_dir(st.engine.paths.docs(), &id)?;
    library::set_active(&dir, &bible_id)?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrdQuestionsBody {
    /// The client's current bible (questions are tailored to it).
    prd: Prd,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PrdQuestionsResponse {
    questions: Vec<Question>,
}

async fn prd_questions(
    State(_st): State<Arc<ServerState>>,
    Path(_id): Path<String>,
    Json(body): Json<PrdQuestionsBody>,
) -> Result<Json<PrdQuestionsResponse>, ApiError> {
    let (provider, model) = resolve_oneshot(body.provider, body.model)?;
    let questions = generate_questions(&body.prd, provider, model.as_deref()).await?;
    Ok(Json(PrdQuestionsResponse { questions }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrdAnswersBody {
    /// The client's current bible (the merged copy is returned to be saved).
    prd: Prd,
    answers: Vec<Answer>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

async fn prd_answers(
    State(_st): State<Arc<ServerState>>,
    Path(_id): Path<String>,
    Json(body): Json<PrdAnswersBody>,
) -> Result<Json<Prd>, ApiError> {
    let (provider, model) = resolve_oneshot(body.provider, body.model)?;
    let merged = apply_answers(&body.prd, &body.answers, provider, model.as_deref()).await?;
    Ok(Json(merged))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrdRecommendBody {
    /// The bible to recommend from (the client passes the active one).
    prd: Prd,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

async fn prd_recommend(
    State(_st): State<Arc<ServerState>>,
    Path(_id): Path<String>,
    Json(body): Json<PrdRecommendBody>,
) -> Result<Json<Recommendations>, ApiError> {
    let catalog = store::fetch_catalog().await?;
    let (provider, model) = resolve_oneshot(body.provider, body.model)?;
    let recs = recommend(&body.prd, &catalog, provider, model.as_deref()).await?;
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrdChatBody {
    prd: Prd,
    #[serde(default)]
    messages: Vec<ChatMessage>,
    message: String,
    /// An optional bible card the user attached for the model to focus on.
    #[serde(default)]
    context: Option<String>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PrdChatResponse {
    reply: String,
}

async fn prd_chat(
    State(_st): State<Arc<ServerState>>,
    Path(_id): Path<String>,
    Json(body): Json<PrdChatBody>,
) -> Result<Json<PrdChatResponse>, ApiError> {
    let (provider, model) = resolve_oneshot(body.provider, body.model)?;
    let reply = prd_chat_fn(
        &body.prd,
        &body.messages,
        &body.message,
        body.context.as_deref(),
        provider,
        model.as_deref(),
    )
    .await?;
    Ok(Json(PrdChatResponse { reply }))
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
