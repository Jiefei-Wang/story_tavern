use std::collections::HashMap;
use std::sync::Mutex;
use keyring::Entry;

static SERVICE_NAME: &str = "story_tavern";
static FALLBACK: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

pub fn set_secret_internal(secret_ref: &str, secret_val: &str) -> Result<(), String> {
    // Attempt Windows Credential Manager via keyring crate
    if let Ok(entry) = Entry::new(SERVICE_NAME, secret_ref) {
        if entry.set_password(secret_val).is_ok() {
            return Ok(());
        }
    }

    // Fallback store
    let mut fallback = FALLBACK.lock().map_err(|e| e.to_string())?;
    if fallback.is_none() {
        *fallback = Some(HashMap::new());
    }
    if let Some(map) = fallback.as_mut() {
        map.insert(secret_ref.to_string(), secret_val.to_string());
    }
    Ok(())
}

pub fn find_env_secret() -> Option<String> {
    if let Ok(val) = std::env::var("OPENROUTER_KEY") {
        if !val.trim().is_empty() {
            return Some(val.trim().to_string());
        }
    }
    if let Ok(val) = std::env::var("openrouter_key") {
        if !val.trim().is_empty() {
            return Some(val.trim().to_string());
        }
    }

    let mut candidates = vec![
        std::path::PathBuf::from(".env"),
        std::path::PathBuf::from("../.env"),
        std::path::PathBuf::from("../../.env"),
    ];

    if let Ok(exe) = std::env::current_exe() {
        if let Some(p) = exe.parent() {
            candidates.push(p.join(".env"));
            if let Some(p2) = p.parent() {
                candidates.push(p2.join(".env"));
                if let Some(p3) = p2.parent() {
                    candidates.push(p3.join(".env"));
                }
            }
        }
    }

    for path in candidates {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                for line in content.lines() {
                    let line = line.trim();
                    if line.starts_with('#') || line.is_empty() {
                        continue;
                    }
                    if let Some((k, v)) = line.split_once('=') {
                        let key = k.trim().to_lowercase();
                        if key == "openrouter_key"
                            || key == "vite_openrouter_key"
                            || key == "openrouter_api_key"
                        {
                            let val = v.trim().trim_matches('"').trim_matches('\'').trim();
                            if !val.is_empty() {
                                return Some(val.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

pub fn get_secret_internal(secret_ref: &str) -> Result<String, String> {
    if let Ok(entry) = Entry::new(SERVICE_NAME, secret_ref) {
        if let Ok(password) = entry.get_password() {
            if !password.trim().is_empty() {
                return Ok(password);
            }
        }
    }

    let fallback = FALLBACK.lock().map_err(|e| e.to_string())?;
    if let Some(map) = fallback.as_ref() {
        if let Some(val) = map.get(secret_ref) {
            if !val.trim().is_empty() {
                return Ok(val.clone());
            }
        }
    }

    // Auto-fallback from .env / env variables
    if let Some(key) = find_env_secret() {
        if secret_ref.contains("openrouter") || secret_ref.contains("backend") {
            let _ = set_secret_internal(secret_ref, &key);
            return Ok(key);
        }
    }

    Err(format!("Secret not found for ref: {}", secret_ref))
}

pub fn delete_secret_internal(secret_ref: &str) -> Result<(), String> {
    if let Ok(entry) = Entry::new(SERVICE_NAME, secret_ref) {
        let _ = entry.delete_credential();
    }

    let mut fallback = FALLBACK.lock().map_err(|e| e.to_string())?;
    if let Some(map) = fallback.as_mut() {
        map.remove(secret_ref);
    }
    Ok(())
}

#[tauri::command]
pub fn secret_set(secret_ref: String, secret_val: String) -> Result<(), String> {
    set_secret_internal(&secret_ref, &secret_val)
}

#[tauri::command]
pub fn secret_get(secret_ref: String) -> Result<String, String> {
    get_secret_internal(&secret_ref)
}

#[tauri::command]
pub fn secret_delete(secret_ref: String) -> Result<(), String> {
    delete_secret_internal(&secret_ref)
}
