use std::{fs, io::Write, path::{Path, PathBuf}};
use serde_json::Value;
use tauri::State;
use crate::db::Database;
use super::db::{db_kv_get_internal, db_kv_set_internal, db_kv_list_internal, KeyValueItem};

fn safe_id(value: &str) -> bool { !value.is_empty() && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') }
fn safe_path(value: &str) -> bool {
    let parts: Vec<_> = value.split('/').collect();
    let stem = |s: &str| s.strip_suffix(".md").map(safe_id).unwrap_or(false);
    match parts.as_slice() {
        ["world", "common.md" | "private.md" | "description.md"] => true,
        ["scenes" | "turns", file] => stem(file),
        ["characters", id, "profile.md" | "public.md" | "memory.md"] => safe_id(id),
        _ => false,
    }
}
fn root(db: &Database) -> Result<PathBuf,String> { Ok(db.db_path.parent().ok_or("Missing data directory")?.join("text-saves")) }
fn no_symlink(path: &Path) -> Result<(),String> {
    for p in path.ancestors() {
        if let Ok(meta) = fs::symlink_metadata(p) {
            if meta.file_type().is_symlink() { return Err("Symlink paths are forbidden".into()); }
            #[cfg(windows)] { use std::os::windows::fs::MetadataExt; if meta.file_attributes() & 0x400 != 0 { return Err("Reparse paths are forbidden".into()); } }
        }
    }
    Ok(())
}
fn hydrate(base: &Path, mut save: Value) -> Result<Value,String> {
    if let Some(snapshot) = save.get("textSnapshot").and_then(Value::as_str) {
        let id = save["id"].as_str().ok_or("Missing ID")?;
        if !safe_id(id) || !safe_id(snapshot) { return Err("Invalid snapshot path".into()); }
        let directory = base.join(id).join(snapshot);
        no_symlink(&directory)?;
        let docs = save["textWorld"]["documents"].as_object_mut().ok_or("Missing document metadata")?;
        for (path, doc) in docs {
            if !safe_path(path) { return Err("Invalid document path".into()); }
            let target = directory.join(path); no_symlink(&target)?;
            doc["text"] = Value::String(fs::read_to_string(target).map_err(|e|e.to_string())?);
        }
    }
    Ok(save)
}

#[tauri::command]
pub fn text_save_list(db: State<'_,Database>) -> Result<Vec<KeyValueItem>,String> {
    list_internal(&db)
}

pub fn list_internal(db: &Database) -> Result<Vec<KeyValueItem>,String> {
    let conn = db.conn.lock().map_err(|e|e.to_string())?;
    let base = root(db)?;
    db_kv_list_internal(&conn,"saves")?.into_iter().map(|item| {
        let value: Value = serde_json::from_str(&item.value).map_err(|e|e.to_string())?;
        Ok(KeyValueItem{key:item.key,value:hydrate(&base,value)?.to_string()})
    }).collect()
}

/** Immutable generation files are flushed before changing the SQLite head.
 * An interrupted write leaves only an unreferenced generation; previous head remains readable. */
#[tauri::command]
pub fn text_save_commit(db: State<'_,Database>, value: String, expected_revision: Option<u64>) -> Result<(),String> {
    commit_internal(&db, &value, expected_revision)
}

#[tauri::command]
pub fn library_commit(db: State<'_,Database>, value: String, expected_revision: i64) -> Result<(),String> {
    library_commit_internal(&db, &value, expected_revision)
}

pub fn library_commit_internal(db: &Database, value: &str, expected_revision: i64) -> Result<(),String> {
    let candidate: Value = serde_json::from_str(&value).map_err(|e|e.to_string())?;
    if expected_revision < -1 || candidate["revision"].as_i64() != Some(expected_revision + 1) || !candidate["data"].is_object() { return Err("Invalid library revision".into()); }
    let conn = db.conn.lock().map_err(|e|e.to_string())?;
    let tx = rusqlite::Transaction::new_unchecked(&conn, rusqlite::TransactionBehavior::Immediate).map_err(|e|e.to_string())?;
    let previous = db_kv_get_internal(&tx, "settings", "story_library_v2")?;
    let previous: Option<Value> = previous.map(|s|serde_json::from_str(&s)).transpose().map_err(|e|e.to_string())?;
    if previous.as_ref().and_then(|s|s["revision"].as_i64()).unwrap_or(-1) != expected_revision { return Err("Library revision conflict".into()); }
    db_kv_set_internal(&tx, "settings", "story_library_v2", &value)?;
    tx.commit().map_err(|e|e.to_string())
}

pub fn commit_internal(db: &Database, value: &str, expected_revision: Option<u64>) -> Result<(),String> {
    let mut save: Value = serde_json::from_str(&value).map_err(|e|e.to_string())?;
    let id = save["id"].as_str().filter(|s|safe_id(s)).ok_or("Invalid save ID")?.to_string();
    let revision = save["textWorld"]["revision"].as_u64().ok_or("Missing text revision")?;
    if revision != expected_revision.map(|n|n+1).unwrap_or(0) { return Err("Invalid next revision".into()); }
    let conn = db.conn.lock().map_err(|e|e.to_string())?;
    let tx = rusqlite::Transaction::new_unchecked(&conn, rusqlite::TransactionBehavior::Immediate).map_err(|e|e.to_string())?;
    let existing = db_kv_get_internal(&tx,"saves",&id)?;
    let old: Option<Value> = existing.map(|s|serde_json::from_str(&s)).transpose().map_err(|e|e.to_string())?;
    if old.as_ref().and_then(|s|s["textWorld"]["revision"].as_u64()) != expected_revision { return Err("Text save revision conflict".into()); }
    let snapshot = format!("generation_{}_{}",revision,std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos());
    let directory = root(&db)?.join(&id).join(&snapshot);
    no_symlink(&directory)?;
    fs::create_dir_all(&directory).map_err(|e|e.to_string())?;
    let docs = save["textWorld"]["documents"].as_object_mut().ok_or("Missing documents")?;
    for (path, doc) in docs {
        if !safe_path(path) { return Err("Invalid document path".into()); }
        let text = doc["text"].as_str().ok_or("Missing document text")?;
        let target = directory.join(path); no_symlink(&target)?;
        fs::create_dir_all(target.parent().ok_or("Missing parent")?).map_err(|e|e.to_string())?;
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&target).map_err(|e|e.to_string())?;
        file.write_all(text.as_bytes()).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;
        doc.as_object_mut().ok_or("Invalid document")?.remove("text");
    }
    save["textSnapshot"] = Value::String(snapshot);
    // SQLite's single statement is the atomic commit point under the shared writer mutex.
    db_kv_set_internal(&tx,"saves",&id,&save.to_string())?;
    tx.commit().map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn library_compare_swap_is_atomic_and_preserves_other_settings() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);").unwrap();
        db_kv_set_internal(&conn,"settings","app_settings",r#"{"theme":"light"}"#).unwrap();
        let db = Database { conn: std::sync::Mutex::new(conn), db_path: PathBuf::from("unused.db") };
        let first = r#"{"revision":0,"data":{"characters":{"a":{"name":"A","future":true}},"stories":{"s":{"playerId":"a"}}}}"#;
        library_commit_internal(&db, first, -1).unwrap();
        assert!(library_commit_internal(&db, first, -1).is_err());
        assert!(library_commit_internal(&db, r#"{"revision":2,"data":{}}"#, 0).is_err());
        let next = r#"{"revision":1,"data":{"characters":{},"stories":{}}}"#;
        library_commit_internal(&db, next, 0).unwrap();
        let conn = db.conn.lock().unwrap();
        assert_eq!(db_kv_get_internal(&conn,"settings","story_library_v2").unwrap().unwrap(),next);
        assert_eq!(db_kv_get_internal(&conn,"settings","app_settings").unwrap().unwrap(),r#"{"theme":"light"}"#);
    }
    #[test] fn paths_are_confined() {
        for p in ["world/common.md","characters/a/profile.md","scenes/hall.md","turns/round_1.md"] { assert!(safe_path(p)); }
        for p in ["../secret","world/../../key","C:/a.md","characters/a/../../key.md","world/common.md:stream","turns/a\\b.md"] { assert!(!safe_path(p)); }
    }
    #[test] fn durable_generation_and_compare_swap_recover_previous_head() {
        let directory=std::env::temp_dir().join(format!("story_text_test_{}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&directory).unwrap();
        let conn=rusqlite::Connection::open(directory.join("test.db")).unwrap();
        conn.execute_batch("CREATE TABLE saves(id TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at TEXT NOT NULL);").unwrap();
        let db=Database{conn:std::sync::Mutex::new(conn),db_path:directory.join("test.db")};
        let mut value=serde_json::json!({"id":"test","textWorld":{"revision":0,"documents":{"world/common.md":{"text":"old complete state","revision":0}}},"turns":[]});
        commit_internal(&db,&value.to_string(),None).unwrap();
        let before=db_kv_get_internal(&db.conn.lock().unwrap(),"saves","test").unwrap().unwrap();
        assert!(!before.contains("old complete state"));
        let loaded=hydrate(&root(&db).unwrap(),serde_json::from_str(&before).unwrap()).unwrap();
        assert_eq!(loaded["textWorld"]["documents"]["world/common.md"]["text"],"old complete state");
        value["textWorld"]["revision"]=1.into();
        value["textWorld"]["documents"]["world/common.md"]["text"]="new complete state".into();
        assert!(commit_internal(&db,&value.to_string(),Some(99)).is_err());
        assert_eq!(db_kv_get_internal(&db.conn.lock().unwrap(),"saves","test").unwrap().unwrap(),before);
        db.conn.lock().unwrap().execute_batch("PRAGMA query_only=ON").unwrap();
        assert!(commit_internal(&db,&value.to_string(),Some(0)).is_err());
        assert_eq!(db_kv_get_internal(&db.conn.lock().unwrap(),"saves","test").unwrap().unwrap(),before);
        db.conn.lock().unwrap().execute_batch("PRAGMA query_only=OFF").unwrap();
        // An interrupted generation must not become the authoritative head.
        let orphan=root(&db).unwrap().join("test").join("generation_interrupted");fs::create_dir_all(&orphan).unwrap();fs::write(orphan.join("partial.md"),"partial").unwrap();
        commit_internal(&db,&value.to_string(),Some(0)).unwrap();
        assert!(commit_internal(&db,&value.to_string(),Some(0)).is_err());
        let head=db_kv_get_internal(&db.conn.lock().unwrap(),"saves","test").unwrap().unwrap();
        assert_eq!(hydrate(&root(&db).unwrap(),serde_json::from_str(&head).unwrap()).unwrap()["textWorld"]["documents"]["world/common.md"]["text"],"new complete state");
        drop(db);
        // This directory is allocated by this test, not an application/user save.
        let checked=directory.canonicalize().unwrap();
        assert_eq!(checked.parent().unwrap(),std::env::temp_dir().canonicalize().unwrap());
        assert!(checked.file_name().unwrap().to_string_lossy().starts_with("story_text_test_"));
        fs::remove_dir_all(checked).unwrap();
    }
}
