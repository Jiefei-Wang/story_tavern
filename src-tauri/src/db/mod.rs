use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use rusqlite::Connection;

pub struct Database {
    pub conn: Mutex<Connection>,
    pub db_path: PathBuf,
}

pub fn get_db_path() -> PathBuf {
    let mut dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("story_tavern");
    fs::create_dir_all(&dir).ok();
    dir.push("story_tavern.db");
    dir
}

pub fn init_db() -> Result<Database, String> {
    let path = get_db_path();
    let conn = Connection::open(&path).map_err(|e| format!("Failed to open SQLite DB: {}", e))?;

    // Create tables
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS backends (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_groups (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS saves (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS traces (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| format!("Failed to initialize SQLite tables: {}", e))?;

    Ok(Database {
        conn: Mutex::new(conn),
        db_path: path,
    })
}
