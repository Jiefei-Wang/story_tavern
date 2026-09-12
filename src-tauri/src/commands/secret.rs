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

pub fn get_secret_internal(secret_ref: &str) -> Result<String, String> {
    if let Ok(entry) = Entry::new(SERVICE_NAME, secret_ref) {
        if let Ok(password) = entry.get_password() {
            return Ok(password);
        }
    }

    let fallback = FALLBACK.lock().map_err(|e| e.to_string())?;
    if let Some(map) = fallback.as_ref() {
        if let Some(val) = map.get(secret_ref) {
            return Ok(val.clone());
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
