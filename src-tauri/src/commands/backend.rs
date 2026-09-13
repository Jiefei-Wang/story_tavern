use std::collections::HashMap;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::secret::get_secret_internal;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub model_count: usize,
    pub error: Option<String>,
    pub latency_ms: u64,
}

fn build_client(timeout_ms: Option<u64>) -> reqwest::Client {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(60000));
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

pub fn normalize_url(base_url: &str, endpoint: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    let ep = endpoint.trim_start_matches('/');
    format!("{}/{}", base, ep)
}

pub fn apply_auth_and_headers(
    mut req: reqwest::RequestBuilder,
    auth_type: Option<&str>,
    secret_ref: Option<&str>,
    headers: Option<&HashMap<String, String>>,
) -> Result<reqwest::RequestBuilder, String> {
    let auth = auth_type.unwrap_or("bearer");

    if auth == "none" {
        // Explicitly forbid adding Authorization header in none mode
    } else if auth == "bearer" {
        let mut token_opt: Option<String> = None;

        if let Some(s_ref) = secret_ref {
            let trimmed_ref = s_ref.trim();
            if !trimmed_ref.is_empty() {
                if let Ok(token) = get_secret_internal(trimmed_ref) {
                    if !token.trim().is_empty() {
                        token_opt = Some(token.trim().to_string());
                    }
                }
            }
        }

        // STRICT: Zero fallback to other backends or openrouter!
        match token_opt {
            Some(token) => {
                req = req.header("Authorization", format!("Bearer {}", token));
            }
            None => {
                return Err(format!(
                    "Missing Bearer credential for backend (secret_ref: '{}')",
                    secret_ref.unwrap_or("none")
                ));
            }
        }
    } else {
        return Err(format!("Unsupported auth_type: '{}'", auth));
    }

    if let Some(hdr_map) = headers {
        for (k, v) in hdr_map {
            let lower = k.trim().to_lowercase();
            if lower == "authorization" {
                return Err("Custom headers cannot override Authorization header".to_string());
            }
            if lower == "content-length" || lower == "host" {
                return Err(format!("Custom header '{}' is forbidden", k));
            }
            req = req.header(k, v);
        }
    }

    Ok(req)
}

#[tauri::command]
pub async fn backend_test_connection(
    base_url: String,
    auth_type: Option<String>,
    secret_ref: Option<String>,
    headers: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
) -> Result<ConnectionTestResult, String> {
    let start = Instant::now();
    let client = build_client(timeout_ms);
    let url = normalize_url(&base_url, "models");

    let req = client.get(&url);
    let req = match apply_auth_and_headers(
        req,
        auth_type.as_deref(),
        secret_ref.as_deref(),
        headers.as_ref(),
    ) {
        Ok(r) => r,
        Err(e) => {
            return Ok(ConnectionTestResult {
                success: false,
                model_count: 0,
                error: Some(e),
                latency_ms: start.elapsed().as_millis() as u64,
            });
        }
    };

    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            let latency_ms = start.elapsed().as_millis() as u64;

            if !status.is_success() {
                let err_text = resp.text().await.unwrap_or_default();
                return Ok(ConnectionTestResult {
                    success: false,
                    model_count: 0,
                    error: Some(format!("HTTP {} - {}", status, err_text)),
                    latency_ms,
                });
            }

            match resp.json::<Value>().await {
                Ok(body) => {
                    let mut count = 0;
                    if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
                        count = data.len();
                    } else if let Some(models) = body.get("models").and_then(|m| m.as_array()) {
                        count = models.len();
                    }
                    Ok(ConnectionTestResult {
                        success: true,
                        model_count: count,
                        error: None,
                        latency_ms,
                    })
                }
                Err(e) => Ok(ConnectionTestResult {
                    success: false, // Strict correctness: JSON parse failure is NOT success!
                    model_count: 0,
                    error: Some(format!("Connected but failed to parse models JSON: {}", e)),
                    latency_ms,
                }),
            }
        }
        Err(e) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            Ok(ConnectionTestResult {
                success: false,
                model_count: 0,
                error: Some(e.to_string()),
                latency_ms,
            })
        }
    }
}

#[tauri::command]
pub async fn backend_list_models(
    base_url: String,
    auth_type: Option<String>,
    secret_ref: Option<String>,
    headers: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
) -> Result<Vec<String>, String> {
    let client = build_client(timeout_ms);
    let url = normalize_url(&base_url, "models");

    let req = client.get(&url);
    let req = apply_auth_and_headers(
        req,
        auth_type.as_deref(),
        secret_ref.as_deref(),
        headers.as_ref(),
    )?;

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Failed to list models: {}", err_text));
    }

    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut model_ids = Vec::new();

    if let Some(arr) = body.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|s| s.as_str()) {
                model_ids.push(id.to_string());
            }
        }
    } else if let Some(arr) = body.get("models").and_then(|m| m.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|s| s.as_str()) {
                model_ids.push(id.to_string());
            } else if let Some(name) = item.get("name").and_then(|s| s.as_str()) {
                model_ids.push(name.to_string());
            }
        }
    }

    Ok(model_ids)
}

#[tauri::command]
pub async fn backend_chat_completion(
    base_url: String,
    auth_type: Option<String>,
    secret_ref: Option<String>,
    headers: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
    request: Value,
    on_chunk: tauri::ipc::Channel<Vec<u8>>,
 ) -> Result<Value, String> {
    chat_completion_internal(base_url, auth_type, secret_ref, headers, timeout_ms, request,
        move |bytes| on_chunk.send(bytes).map_err(|_| "Stream receiver unavailable".to_string())).await
}

pub async fn chat_completion_internal(
    base_url: String, auth_type: Option<String>, secret_ref: Option<String>,
    headers: Option<HashMap<String, String>>, timeout_ms: Option<u64>, request: Value,
    on_chunk: impl Fn(Vec<u8>) -> Result<(), String>,
) -> Result<Value, String> {
    let client = build_client(timeout_ms);
    let url = normalize_url(&base_url, "chat/completions");

    let req = client.post(&url).json(&request);
    let req = apply_auth_and_headers(
        req,
        auth_type.as_deref(),
        secret_ref.as_deref(),
        headers.as_ref(),
    )?;

    let mut resp = req.send().await.map_err(|e| format!("Network request failed: {}", e))?;
    let status = resp.status();
    if status.is_success() && resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").contains("text/event-stream") {
        while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Stream interrupted: {}", e))? {
            on_chunk(chunk.to_vec())?;
        }
        return Ok(Value::Null);
    }
    let text = resp.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;

    if !status.is_success() {
        if status.as_u16() == 401 {
            if text.contains("No cookie auth credentials found") {
                return Err(format!(
                    "OpenRouter API Key 认证失败 (HTTP 401: 未检测到有效 API Key)。\n请在【AI 配置】中为 OpenRouter 填写有效的 API Key，或在主页切换为【Mock 模拟模式】免配置体验。\n原始返回: {}",
                    text
                ));
            } else {
                return Err(format!(
                    "后端 API Key 认证失败 (HTTP 401): {}\n请在【AI 配置】中检查对应后端的 API Key 是否正确填写或有效。",
                    text
                ));
            }
        }
        return Err(format!("HTTP {} error from backend: {}", status, text));
    }

    serde_json::from_str::<Value>(&text)
        .map_err(|e| format!("Failed to parse response JSON: {} (raw: {})", e, text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_url() {
        assert_eq!(
            normalize_url("https://api.openai.com/v1/", "/chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_url("http://localhost:11434", "models"),
            "http://localhost:11434/models"
        );
    }

    #[test]
    fn test_apply_auth_none_does_not_require_secret() {
        let client = reqwest::Client::new();
        let req = client.get("http://localhost:11434/models");
        let result = apply_auth_and_headers(req, Some("none"), None, None);
        assert!(result.is_ok());
    }

    #[test]
    fn test_apply_auth_none_never_adds_auth_header() {
        let client = reqwest::Client::new();
        let req = client.get("http://localhost:11434/models");
        // Even if secret_ref points to openrouter or anything else, none mode must succeed without error
        let result = apply_auth_and_headers(req, Some("none"), Some("backend_openrouter"), None);
        assert!(result.is_ok());
    }

    #[test]
    fn test_apply_auth_bearer_missing_secret_fails_without_openrouter_fallback() {
        let client = reqwest::Client::new();
        let req = client.get("https://api.openai.com/v1/models");
        // Secret for backend A does not exist
        let result = apply_auth_and_headers(req, Some("bearer"), Some("secret_backend_a_nonexistent"), None);
        assert!(result.is_err(), "Must fail when secret_ref is not found; NO OpenRouter fallback allowed");
        let err_msg = result.err().unwrap();
        assert!(err_msg.contains("Missing Bearer credential"));
    }

    #[test]
    fn test_apply_auth_bearer_empty_secret_ref_fails() {
        let client = reqwest::Client::new();
        let req = client.get("https://api.openai.com/v1/models");
        let result = apply_auth_and_headers(req, Some("bearer"), None, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_custom_headers_forbid_authorization_override() {
        let client = reqwest::Client::new();
        let req = client.get("http://localhost:11434/models");
        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer malicious_override".to_string());
        let result = apply_auth_and_headers(req, Some("none"), None, Some(&headers));
        assert!(result.is_err());
        assert!(result.err().unwrap().contains("cannot override Authorization header"));

        let req2 = client.get("http://localhost:11434/models");
        let mut headers_lower = HashMap::new();
        headers_lower.insert("authorization".to_string(), "Bearer test".to_string());
        let result2 = apply_auth_and_headers(req2, Some("none"), None, Some(&headers_lower));
        assert!(result2.is_err());
    }

    #[test]
    fn test_custom_headers_forbid_transport_headers() {
        let client = reqwest::Client::new();
        let req = client.get("http://localhost:11434/models");
        let mut headers = HashMap::new();
        headers.insert("Host".to_string(), "evil.com".to_string());
        let result = apply_auth_and_headers(req, Some("none"), None, Some(&headers));
        assert!(result.is_err());
        assert!(result.err().unwrap().contains("is forbidden"));
    }
}
