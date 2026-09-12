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

fn normalize_url(base_url: &str, endpoint: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    let ep = endpoint.trim_start_matches('/');
    format!("{}/{}", base, ep)
}

fn apply_auth_and_headers(
    mut req: reqwest::RequestBuilder,
    secret_ref: Option<&str>,
    headers: Option<&HashMap<String, String>>,
) -> reqwest::RequestBuilder {
    if let Some(s_ref) = secret_ref {
        if !s_ref.trim().is_empty() {
            if let Ok(token) = get_secret_internal(s_ref) {
                if !token.trim().is_empty() {
                    req = req.header("Authorization", format!("Bearer {}", token.trim()));
                }
            }
        }
    }

    if let Some(hdr_map) = headers {
        for (k, v) in hdr_map {
            req = req.header(k, v);
        }
    }

    req
}

#[tauri::command]
pub async fn backend_test_connection(
    base_url: String,
    secret_ref: Option<String>,
    headers: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
) -> Result<ConnectionTestResult, String> {
    let start = Instant::now();
    let client = build_client(timeout_ms);
    let url = normalize_url(&base_url, "models");

    let req = client.get(&url);
    let req = apply_auth_and_headers(req, secret_ref.as_deref(), headers.as_ref());

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
                    success: true,
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
    secret_ref: Option<String>,
    headers: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
) -> Result<Vec<String>, String> {
    let client = build_client(timeout_ms);
    let url = normalize_url(&base_url, "models");

    let req = client.get(&url);
    let req = apply_auth_and_headers(req, secret_ref.as_deref(), headers.as_ref());

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
    secret_ref: Option<String>,
    headers: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
    request: Value,
) -> Result<Value, String> {
    let client = build_client(timeout_ms);
    let url = normalize_url(&base_url, "chat/completions");

    let req = client.post(&url).json(&request);
    let req = apply_auth_and_headers(req, secret_ref.as_deref(), headers.as_ref());

    let resp = req.send().await.map_err(|e| format!("Network request failed: {}", e))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;

    if !status.is_success() {
        return Err(format!("HTTP {} error from backend: {}", status, text));
    }

    serde_json::from_str::<Value>(&text)
        .map_err(|e| format!("Failed to parse response JSON: {} (raw: {})", e, text))
}
