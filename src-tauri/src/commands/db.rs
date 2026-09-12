use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::Database;

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyValueItem {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub fn db_get_path(db: State<'_, Database>) -> Result<String, String> {
    Ok(db.db_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn db_kv_set(
    db: State<'_, Database>,
    table: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let allowed_tables = ["backends", "agents", "agent_groups", "saves", "traces", "settings"];
    if !allowed_tables.contains(&table.as_str()) {
        return Err(format!("Invalid table name: {}", table));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    if table == "settings" {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            rusqlite::params![key, value],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let sql = format!(
            "INSERT INTO {} (id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data = ?2, updated_at = ?3",
            table
        );
        conn.execute(&sql, rusqlite::params![key, value, now])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn db_kv_get(
    db: State<'_, Database>,
    table: String,
    key: String,
) -> Result<Option<String>, String> {
    let allowed_tables = ["backends", "agents", "agent_groups", "saves", "traces", "settings"];
    if !allowed_tables.contains(&table.as_str()) {
        return Err(format!("Invalid table name: {}", table));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    if table == "settings" {
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(rusqlite::params![key]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let val: String = row.get(0).map_err(|e| e.to_string())?;
            return Ok(Some(val));
        }
    } else {
        let sql = format!("SELECT data FROM {} WHERE id = ?1", table);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut rows = stmt.query(rusqlite::params![key]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let val: String = row.get(0).map_err(|e| e.to_string())?;
            return Ok(Some(val));
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn db_kv_list(
    db: State<'_, Database>,
    table: String,
) -> Result<Vec<KeyValueItem>, String> {
    let allowed_tables = ["backends", "agents", "agent_groups", "saves", "traces", "settings"];
    if !allowed_tables.contains(&table.as_str()) {
        return Err(format!("Invalid table name: {}", table));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut items = Vec::new();

    if table == "settings" {
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(KeyValueItem {
                    key: row.get(0)?,
                    value: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;

        for item in rows {
            if let Ok(it) = item {
                items.push(it);
            }
        }
    } else {
        let sql = format!("SELECT id, data FROM {} ORDER BY updated_at DESC", table);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(KeyValueItem {
                    key: row.get(0)?,
                    value: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;

        for item in rows {
            if let Ok(it) = item {
                items.push(it);
            }
        }
    }

    Ok(items)
}

#[tauri::command]
pub fn db_kv_delete(
    db: State<'_, Database>,
    table: String,
    key: String,
) -> Result<(), String> {
    let allowed_tables = ["backends", "agents", "agent_groups", "saves", "traces", "settings"];
    if !allowed_tables.contains(&table.as_str()) {
        return Err(format!("Invalid table name: {}", table));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let col = if table == "settings" { "key" } else { "id" };
    let sql = format!("DELETE FROM {} WHERE {} = ?1", table, col);
    conn.execute(&sql, rusqlite::params![key])
        .map_err(|e| e.to_string())?;

    Ok(())
}
