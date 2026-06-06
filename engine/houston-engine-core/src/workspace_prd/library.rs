//! A workspace can hold several "context bibles". They live together in
//! `prd/bibles.json` at the workspace root, with one marked active — the active
//! bible is what gets injected into agents' system prompts.
//!
//! Single-file store (a handful of text docs), read/written whole and atomically
//! enough for this surface. Migrates the legacy single `PRD.json` into the
//! library on first load so existing users keep their bible.

use super::types::Prd;
use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const LIBRARY_REL: &str = "prd/bibles.json";
const LEGACY_PRD: &str = "PRD.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StoredBible {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub prd: Prd,
}

/// Lightweight listing entry (no full bible payload).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BibleMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    #[serde(default)]
    pub active_id: String,
    #[serde(default)]
    pub bibles: Vec<StoredBible>,
}

/// What the listing endpoint returns: metas + which one is active.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BibleList {
    pub active_id: String,
    pub bibles: Vec<BibleMeta>,
}

fn library_path(ws_dir: &Path) -> PathBuf {
    ws_dir.join(LIBRARY_REL)
}

/// Load the library, migrating a legacy root `PRD.json` on first run.
pub fn load(ws_dir: &Path) -> CoreResult<Library> {
    let path = library_path(ws_dir);
    match fs::read_to_string(&path) {
        Ok(c) if !c.trim().is_empty() => serde_json::from_str(&c)
            .map_err(|e| CoreError::Internal(format!("failed to parse {LIBRARY_REL}: {e}"))),
        Ok(_) => Ok(Library::default()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => migrate_legacy(ws_dir),
        Err(e) => Err(CoreError::Internal(format!("failed to read {LIBRARY_REL}: {e}"))),
    }
}

fn migrate_legacy(ws_dir: &Path) -> CoreResult<Library> {
    let legacy = ws_dir.join(LEGACY_PRD);
    let Ok(contents) = fs::read_to_string(&legacy) else {
        return Ok(Library::default());
    };
    let prd: Prd = serde_json::from_str(&contents).unwrap_or_default();
    let bible = new_bible("Company Bible", prd);
    let lib = Library {
        active_id: bible.id.clone(),
        bibles: vec![bible],
    };
    save(ws_dir, &lib)?;
    Ok(lib)
}

pub fn save(ws_dir: &Path, lib: &Library) -> CoreResult<()> {
    let path = library_path(ws_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let body = serde_json::to_string_pretty(lib)
        .map_err(|e| CoreError::Internal(format!("failed to serialize {LIBRARY_REL}: {e}")))?;
    fs::write(&path, body)
        .map_err(|e| CoreError::Internal(format!("failed to write {LIBRARY_REL}: {e}")))?;
    Ok(())
}

fn new_bible(name: &str, prd: Prd) -> StoredBible {
    let now = Utc::now().to_rfc3339();
    StoredBible {
        id: Uuid::new_v4().to_string(),
        name: name.trim().to_string(),
        created_at: now.clone(),
        updated_at: now,
        prd,
    }
}

fn meta(b: &StoredBible) -> BibleMeta {
    BibleMeta {
        id: b.id.clone(),
        name: b.name.clone(),
        created_at: b.created_at.clone(),
        updated_at: b.updated_at.clone(),
    }
}

pub fn list(ws_dir: &Path) -> CoreResult<BibleList> {
    let lib = load(ws_dir)?;
    Ok(BibleList {
        active_id: lib.active_id,
        bibles: lib.bibles.iter().map(meta).collect(),
    })
}

pub fn get(ws_dir: &Path, id: &str) -> CoreResult<Prd> {
    let lib = load(ws_dir)?;
    lib.bibles
        .into_iter()
        .find(|b| b.id == id)
        .map(|b| b.prd)
        .ok_or_else(|| CoreError::NotFound(format!("bible {id}")))
}

pub fn create(ws_dir: &Path, name: &str) -> CoreResult<BibleMeta> {
    let mut lib = load(ws_dir)?;
    let name = if name.trim().is_empty() { "Untitled" } else { name };
    let bible = new_bible(name, Prd::default());
    let m = meta(&bible);
    if lib.bibles.is_empty() {
        lib.active_id = bible.id.clone();
    }
    lib.bibles.push(bible);
    save(ws_dir, &lib)?;
    Ok(m)
}

pub fn update(ws_dir: &Path, id: &str, prd: &Prd) -> CoreResult<Prd> {
    let mut lib = load(ws_dir)?;
    let bible = lib
        .bibles
        .iter_mut()
        .find(|b| b.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("bible {id}")))?;
    bible.prd = prd.clone();
    bible.updated_at = Utc::now().to_rfc3339();
    let result = bible.prd.clone();
    save(ws_dir, &lib)?;
    Ok(result)
}

pub fn delete(ws_dir: &Path, id: &str) -> CoreResult<()> {
    let mut lib = load(ws_dir)?;
    let before = lib.bibles.len();
    lib.bibles.retain(|b| b.id != id);
    if lib.bibles.len() == before {
        return Err(CoreError::NotFound(format!("bible {id}")));
    }
    if lib.active_id == id {
        lib.active_id = lib.bibles.first().map(|b| b.id.clone()).unwrap_or_default();
    }
    save(ws_dir, &lib)
}

pub fn set_active(ws_dir: &Path, id: &str) -> CoreResult<()> {
    let mut lib = load(ws_dir)?;
    if !lib.bibles.iter().any(|b| b.id == id) {
        return Err(CoreError::NotFound(format!("bible {id}")));
    }
    lib.active_id = id.to_string();
    save(ws_dir, &lib)
}

/// The active bible's document, used for prompt injection. `None` when there is
/// no active bible yet.
pub fn active_prd(ws_dir: &Path) -> Option<Prd> {
    let lib = load(ws_dir).ok()?;
    lib.bibles
        .into_iter()
        .find(|b| b.id == lib.active_id)
        .map(|b| b.prd)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn create_list_activate_update_delete() {
        let d = TempDir::new().unwrap();
        let a = create(d.path(), "Product A").unwrap();
        let b = create(d.path(), "Product B").unwrap();
        let listed = list(d.path()).unwrap();
        assert_eq!(listed.bibles.len(), 2);
        // First created is auto-active.
        assert_eq!(listed.active_id, a.id);

        set_active(d.path(), &b.id).unwrap();
        assert_eq!(list(d.path()).unwrap().active_id, b.id);

        let mut prd = Prd::default();
        prd.company.name = "Acme".into();
        update(d.path(), &a.id, &prd).unwrap();
        assert_eq!(get(d.path(), &a.id).unwrap().company.name, "Acme");

        delete(d.path(), &b.id).unwrap();
        let after = list(d.path()).unwrap();
        assert_eq!(after.bibles.len(), 1);
        // Deleting the active one reassigns active to a survivor.
        assert_eq!(after.active_id, a.id);
    }

    #[test]
    fn migrates_legacy_prd_json() {
        let d = TempDir::new().unwrap();
        fs::write(
            d.path().join(LEGACY_PRD),
            r#"{"company":{"name":"Legacy Co"}}"#,
        )
        .unwrap();
        let lib = load(d.path()).unwrap();
        assert_eq!(lib.bibles.len(), 1);
        assert_eq!(lib.bibles[0].prd.company.name, "Legacy Co");
        assert_eq!(lib.active_id, lib.bibles[0].id);
        // Library file now exists.
        assert!(d.path().join(LIBRARY_REL).exists());
    }

    #[test]
    fn active_prd_follows_active_id() {
        let d = TempDir::new().unwrap();
        let a = create(d.path(), "A").unwrap();
        let mut prd = Prd::default();
        prd.company.name = "Active Co".into();
        update(d.path(), &a.id, &prd).unwrap();
        assert_eq!(active_prd(d.path()).unwrap().company.name, "Active Co");
    }

    #[test]
    fn get_missing_errors() {
        let d = TempDir::new().unwrap();
        assert!(get(d.path(), "nope").is_err());
    }
}
