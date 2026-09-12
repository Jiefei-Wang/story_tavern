//! Opt-in integration-test bridge. Production builds never open a listener.
use serde_json::Value;
use std::sync::Mutex;

#[derive(Default)]
pub struct ControlState {
    #[cfg(feature = "test-control")]
    started: Mutex<bool>,
    pending: Mutex<std::collections::HashMap<String, std::sync::mpsc::Sender<Value>>>,
}

#[tauri::command]
pub fn test_control_reply(id: String, result: Value, state: tauri::State<ControlState>) {
    if let Some(sender) = state.pending.lock().unwrap().remove(&id) {
        let _ = sender.send(result);
    }
}

#[tauri::command]
pub fn test_control_start(app: tauri::AppHandle, state: tauri::State<ControlState>) -> Result<bool, String> {
    #[cfg(not(feature = "test-control"))]
    { let _ = (app, state); Ok(false) }
    #[cfg(feature = "test-control")]
    {
        use tauri::{Emitter, Manager};
        let Ok(port) = std::env::var("STORY_TAVERN_TEST_PORT") else { return Ok(false); };
        let port: u16 = port.parse().map_err(|_| "invalid test port")?;
        let token = std::env::var("STORY_TAVERN_TEST_TOKEN").map_err(|_| "test token required")?;
        if token.len() < 24 || std::env::var("STORY_TAVERN_TEST_DIR").is_err() {
            return Err("test control requires a long token and isolated test directory".into());
        }
        let mut started = state.started.lock().unwrap();
        if *started { return Ok(true); }
        let server = tiny_http::Server::http(("127.0.0.1", port)).map_err(|e| e.to_string())?;
        *started = true;
        std::thread::spawn(move || {
            for mut request in server.incoming_requests() {
                let authorized = request.headers().iter().any(|h| h.field.equiv("Authorization") && h.value.as_str() == format!("Bearer {token}"));
                // No CORS; browser-origin requests are deliberately rejected.
                let origin = request.headers().iter().any(|h| h.field.equiv("Origin"));
                if !authorized || origin {
                    let _ = request.respond(tiny_http::Response::empty(403));
                    continue;
                }
                if request.method() != &tiny_http::Method::Post || request.url() != "/command" {
                    let _ = request.respond(tiny_http::Response::empty(404));
                    continue;
                }
                if !matches!(request.body_length(), Some(n) if n <= 65536) {
                    let _ = request.respond(tiny_http::Response::empty(413));
                    continue;
                }
                let mut body = String::new();
                if request.as_reader().read_to_string(&mut body).is_err() {
                    let _ = request.respond(tiny_http::Response::empty(400));
                    continue;
                }
                let Ok(mut payload) = serde_json::from_str::<Value>(&body) else {
                    let _ = request.respond(tiny_http::Response::empty(400));
                    continue;
                };
                if !payload.is_object() {
                    let _ = request.respond(tiny_http::Response::empty(400));
                    continue;
                }
                let id = uuid::Uuid::new_v4().to_string();
                payload["id"] = Value::String(id.clone());
                let (sender, receiver) = std::sync::mpsc::channel();
                let state = app.state::<ControlState>();
                state.pending.lock().unwrap().insert(id.clone(), sender);
                let result = if app.emit("test-control-request", payload).is_ok() {
                    receiver.recv_timeout(std::time::Duration::from_secs(300)).unwrap_or_else(|_| serde_json::json!({"error":"control request timed out"}))
                } else { serde_json::json!({"error":"frontend unavailable"}) };
                state.pending.lock().unwrap().remove(&id);
                let response = tiny_http::Response::from_string(result.to_string()).with_header(
                    tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap()
                );
                let _ = request.respond(response);
            }
        });
        Ok(true)
    }
}
