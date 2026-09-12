use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::Database;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct KeyValueItem {
    pub key: String,
    pub value: String,
}

pub fn db_kv_set_internal(
    conn: &Connection,
    table: &str,
    key: &str,
    value: &str,
) -> Result<(), String> {
    let allowed_tables = ["backends", "agents", "agent_groups", "saves", "traces", "settings"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table name: {}", table));
    }

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

pub fn db_kv_get_internal(
    conn: &Connection,
    table: &str,
    key: &str,
) -> Result<Option<String>, String> {
    let allowed_tables = ["backends", "agents", "agent_groups", "saves", "traces", "settings"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table name: {}", table));
    }

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

pub fn db_kv_list_internal(
    conn: &Connection,
    table: &str,
) -> Result<Vec<KeyValueItem>, String> {
    let allowed_tables = ["backends", "agents", "agent_groups", "saves", "traces", "settings"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table name: {}", table));
    }

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

pub fn db_kv_delete_internal(
    conn: &Connection,
    table: &str,
    key: &str,
) -> Result<(), String> {
    let allowed_tables = ["backends", "agents", "agent_groups", "saves", "traces", "settings"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table name: {}", table));
    }

    let col = if table == "settings" { "key" } else { "id" };
    let sql = format!("DELETE FROM {} WHERE {} = ?1", table, col);
    conn.execute(&sql, rusqlite::params![key])
        .map_err(|e| e.to_string())?;

    Ok(())
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
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    db_kv_set_internal(&conn, &table, &key, &value)
}

#[tauri::command]
pub fn db_kv_get(
    db: State<'_, Database>,
    table: String,
    key: String,
) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    db_kv_get_internal(&conn, &table, &key)
}

#[tauri::command]
pub fn db_kv_list(
    db: State<'_, Database>,
    table: String,
) -> Result<Vec<KeyValueItem>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    db_kv_list_internal(&conn, &table)
}

#[tauri::command]
pub fn db_kv_delete(
    db: State<'_, Database>,
    table: String,
    key: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    db_kv_delete_internal(&conn, &table, &key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_in_memory_db;

    #[test]
    fn test_invalid_table_rejection() {
        let db = init_in_memory_db().unwrap();
        let conn = db.conn.lock().unwrap();

        let res = db_kv_set_internal(&conn, "users_table_not_allowed", "k1", "v1");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Invalid table name"));
    }

    #[test]
    fn test_database_crud_and_traces_table() {
        let db = init_in_memory_db().unwrap();
        let conn = db.conn.lock().unwrap();

        // 1. Test backends CRUD
        let set_res = db_kv_set_internal(&conn, "backends", "b1", "{\"name\":\"test\"}");
        assert!(set_res.is_ok());

        let get_res = db_kv_get_internal(&conn, "backends", "b1").unwrap();
        assert_eq!(get_res, Some("{\"name\":\"test\"}".to_string()));

        // 2. Test traces table CRUD (verifying updated_at column works!)
        let trace_json = "{\"id\":\"tr_1\",\"turnNumber\":1}";
        let trace_set = db_kv_set_internal(&conn, "traces", "tr_1", trace_json);
        assert!(trace_set.is_ok());

        let trace_list = db_kv_list_internal(&conn, "traces").unwrap();
        assert_eq!(trace_list.len(), 1);
        assert_eq!(trace_list[0].key, "tr_1");
        assert_eq!(trace_list[0].value, trace_json);

        // 3. Test delete
        let del_res = db_kv_delete_internal(&conn, "traces", "tr_1");
        assert!(del_res.is_ok());

        let get_after_del = db_kv_get_internal(&conn, "traces", "tr_1").unwrap();
        assert_eq!(get_after_del, None);
    }
}
