use keyring::Entry;

static SERVICE_NAME: &str = "story_tavern";

pub fn set_secret_internal(secret_ref: &str, secret_val: &str) -> Result<(), String> {
    if secret_ref.trim().is_empty() {
        return Err("secret_ref cannot be empty".to_string());
    }

    let entry = Entry::new(SERVICE_NAME, secret_ref)
        .map_err(|e| format!("Keyring initialization error for '{}': {}", secret_ref, e))?;

    entry
        .set_password(secret_val)
        .map_err(|e| format!("Windows Credential Manager set_password failed for '{}': {}", secret_ref, e))
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

    // Auto-fallback from .env / env variables ONLY for explicitly bound OpenRouter refs
    if secret_ref == "backend_openrouter" || secret_ref == "secret_openrouter_default" {
        if let Some(key) = find_env_secret() {
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
    Ok(())
}

#[tauri::command]
pub fn secret_set(secret_ref: String, secret_val: String) -> Result<(), String> {
    set_secret_internal(&secret_ref, &secret_val)
}

#[tauri::command]
pub fn secret_delete(secret_ref: String) -> Result<(), String> {
    delete_secret_internal(&secret_ref)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_ref_empty_fails() {
        let res = set_secret_internal("", "test_value");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn test_secret_get_nonexistent() {
        let res = get_secret_internal("non_existent_secret_key_12345");
        assert!(res.is_err());
    }
}
