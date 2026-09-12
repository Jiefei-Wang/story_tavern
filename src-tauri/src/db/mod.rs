use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use rusqlite::Connection;

pub struct Database {
    pub conn: Mutex<Connection>,
    pub db_path: PathBuf,
}

pub fn get_db_path() -> PathBuf {
    #[cfg(feature = "test-control")]
    if let Ok(dir) = std::env::var("STORY_TAVERN_TEST_DIR") {
        let dir = PathBuf::from(dir);
        fs::create_dir_all(&dir).expect("failed to create isolated test directory");
        return dir.join("story_tavern.db");
    }
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
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| format!("Failed to initialize SQLite tables: {}", e))?;

    // Migration: If traces was previously created with created_at instead of updated_at
    let _ = conn.execute("ALTER TABLE traces ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''", []);

    Ok(Database {
        conn: Mutex::new(conn),
        db_path: path,
    })
}

pub fn init_in_memory_db() -> Result<Database, String> {
    let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
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
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    Ok(Database {
        conn: Mutex::new(conn),
        db_path: PathBuf::from(":memory:"),
    })
}
