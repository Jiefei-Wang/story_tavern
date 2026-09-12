pub mod commands;
pub mod db;

use commands::backend::{backend_chat_completion, backend_list_models, backend_test_connection};
use commands::db::{db_get_path, db_kv_delete, db_kv_get, db_kv_list, db_kv_set};
use commands::secret::{secret_delete, secret_set};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = db::init_db().expect("failed to initialize SQLite database");

    // Auto-seed API keys from environment or local .env if found
    if let Some(key) = commands::secret::find_env_secret() {
        let _ = commands::secret::set_secret_internal("backend_openrouter", &key);
        let _ = commands::secret::set_secret_internal("secret_openrouter_default", &key);
    }

    tauri::Builder::default()
        .manage(database)
        .invoke_handler(tauri::generate_handler![
            secret_set,
            secret_delete,
            backend_test_connection,
            backend_list_models,
            backend_chat_completion,
            db_get_path,
            db_kv_set,
            db_kv_get,
            db_kv_list,
            db_kv_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
