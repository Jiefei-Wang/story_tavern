//! Loopback sidecar for the Vite host. No credential-reading RPC is exposed.
use std::{io::{Read, Write}, sync::{Arc, mpsc}, collections::HashMap};
use serde_json::{Value, json};
use story_tavern_lib::{db::{self, Database}, commands::{db as kv, text, secret, backend}};

fn string(args: &Value, key: &str) -> Result<String,String> { args[key].as_str().map(str::to_owned).ok_or_else(||format!("Missing {key}")) }
fn optional(args: &Value, key: &str) -> Option<String> { args[key].as_str().map(str::to_owned) }
fn headers(args: &Value) -> Result<Option<HashMap<String,String>>,String> { serde_json::from_value(args.get("headers").cloned().unwrap_or(Value::Null)).map_err(|e|e.to_string()) }

async fn dispatch(db: &Database, command: &str, args: Value, chunks: tokio::sync::mpsc::UnboundedSender<Vec<u8>>) -> Result<Value,String> {
    match command {
        "db_get_path" => Ok(json!(db.db_path.to_string_lossy())),
        "db_kv_get" | "db_kv_set" | "db_kv_list" | "db_kv_delete" => {
            let table = string(&args,"table")?;
            let conn = db.conn.lock().map_err(|e|e.to_string())?;
            match command {
                "db_kv_get" => Ok(json!(kv::db_kv_get_internal(&conn,&table,&string(&args,"key")?)?)),
                "db_kv_list" => Ok(json!(kv::db_kv_list_internal(&conn,&table)?)),
                "db_kv_set" => { kv::db_kv_set_internal(&conn,&table,&string(&args,"key")?,&string(&args,"value")?)?; Ok(Value::Null) },
                _ => { kv::db_kv_delete_internal(&conn,&table,&string(&args,"key")?)?; Ok(Value::Null) },
            }
        },
        "text_save_list" => Ok(json!(text::list_internal(db)?)),
        "text_save_commit" => { text::commit_internal(db,&string(&args,"value")?,args["expectedRevision"].as_u64())?; Ok(Value::Null) },
        "library_commit" => { text::library_commit_internal(db,&string(&args,"value")?,args["expectedRevision"].as_i64().ok_or("Missing revision")?)?; Ok(Value::Null) },
        "secret_set" => { secret::set_secret_internal(&string(&args,"secretRef")?,&string(&args,"secretVal")?)?; Ok(Value::Null) },
        "secret_delete" => { secret::delete_secret_internal(&string(&args,"secretRef")?)?; Ok(Value::Null) },
        "backend_test_connection" => Ok(json!(backend::backend_test_connection(string(&args,"baseUrl")?,optional(&args,"authType"),optional(&args,"secretRef"),headers(&args)?,args["timeoutMs"].as_u64()).await?)),
        "backend_list_models" => Ok(json!(backend::backend_list_models(string(&args,"baseUrl")?,optional(&args,"authType"),optional(&args,"secretRef"),headers(&args)?,args["timeoutMs"].as_u64()).await?)),
        "backend_chat_completion" => backend::chat_completion_internal(string(&args,"baseUrl")?,optional(&args,"authType"),optional(&args,"secretRef"),headers(&args)?,args["timeoutMs"].as_u64(),args["request"].clone(),move |bytes| chunks.send(bytes).map_err(|_|"Request cancelled".into())).await,
        _ => Err("Unsupported local command".into()),
    }
}

struct StreamReader { rx: mpsc::Receiver<Vec<u8>>, current: std::io::Cursor<Vec<u8>>, _cancelled: tokio::sync::oneshot::Sender<()> }
impl Read for StreamReader {
    fn read(&mut self, output: &mut [u8]) -> std::io::Result<usize> {
        loop {
            let n = self.current.read(output)?;
            if n > 0 { return Ok(n); }
            match self.rx.recv() { Ok(bytes) => self.current = std::io::Cursor::new(bytes), Err(_) => return Ok(0) }
        }
    }
}
fn authorized(request: &tiny_http::Request, token: &str) -> bool {
    request.method() == &tiny_http::Method::Post && request.url() == "/rpc" &&
    !request.headers().iter().any(|h|h.field.equiv("Origin")) &&
    request.headers().iter().any(|h|h.field.equiv("Authorization") && h.value.as_str() == format!("Bearer {token}"))
}
fn main() -> Result<(),Box<dyn std::error::Error>> {
    let token = std::env::var("STORY_TAVERN_BRIDGE_TOKEN")?;
    if token.len() < 32 { return Err("A private bridge token is required".into()); }
    let args: Vec<String> = std::env::args().skip(1).collect();
    let database = if args.len() == 2 && args[0] == "--data-dir" {
        let dir = std::path::PathBuf::from(&args[1]);
        std::fs::create_dir_all(&dir)?;
        db::init_db_at(dir.join("story_tavern.db"))
    } else if args.is_empty() { db::init_db() } else { return Err("Usage: storage_server [--data-dir DIRECTORY]".into()); };
    let db = Arc::new(database.map_err(std::io::Error::other)?);
    let runtime = Arc::new(tokio::runtime::Runtime::new()?);
    let server = tiny_http::Server::http(("127.0.0.1",0)).map_err(|e|std::io::Error::other(e.to_string()))?;
    println!("{}",json!({"port":server.server_addr().to_ip().unwrap().port()})); std::io::stdout().flush()?;
    // Parent owns stdin; stop this sidecar when its host closes or restarts.
    std::thread::spawn(|| { let mut sink=Vec::new(); let _=std::io::stdin().read_to_end(&mut sink); std::process::exit(0); });
    for mut request in server.incoming_requests() {
        if !authorized(&request,&token) { let _=request.respond(tiny_http::Response::empty(403)); continue; }
        if !matches!(request.body_length(),Some(n) if n <= 64*1024*1024) { let _=request.respond(tiny_http::Response::empty(413)); continue; }
        let db=db.clone(); let runtime=runtime.clone();
        std::thread::spawn(move || {
            let mut body=String::new();
            if request.as_reader().take(64*1024*1024+1).read_to_string(&mut body).is_err() { let _=request.respond(tiny_http::Response::empty(400)); return; }
            let payload: Value = match serde_json::from_str(&body) { Ok(v)=>v,Err(_)=>{let _=request.respond(tiny_http::Response::empty(400));return;} };
            let command=payload["command"].as_str().unwrap_or("").to_owned();
            let (tx,rx)=mpsc::channel(); let (cancelled,mut cancel)=tokio::sync::oneshot::channel();
            runtime.spawn(async move {
                let (chunks,mut stream)=tokio::sync::mpsc::unbounded_channel();
                let work=dispatch(&db,&command,payload["args"].clone(),chunks);
                tokio::pin!(work);
                let mut heartbeat = tokio::time::interval(std::time::Duration::from_secs(1));
                let result=loop { tokio::select! {
                    _=heartbeat.tick()=>if tx.send(b"{}\n".to_vec()).is_err() { return; },
                    _= &mut cancel => return,
                    bytes=stream.recv()=> if let Some(bytes)=bytes { if tx.send(format!("{}\n",json!({"chunk":bytes})).into_bytes()).is_err() {return;} },
                    result=&mut work=>break result,
                }};
                while let Ok(bytes)=stream.try_recv() { let _=tx.send(format!("{}\n",json!({"chunk":bytes})).into_bytes()); }
                let envelope=match result { Ok(value)=>json!({"result":value}),Err(error)=>json!({"error":error}) };
                let _=tx.send(format!("{envelope}\n").into_bytes());
            });
            let response=tiny_http::Response::new(tiny_http::StatusCode(200),vec![tiny_http::Header::from_bytes("Content-Type","application/x-ndjson").unwrap(),tiny_http::Header::from_bytes("Cache-Control","no-store").unwrap()],StreamReader{rx,current:std::io::Cursor::new(Vec::new()),_cancelled:cancelled},None,None);
            let _=request.respond(response);
        });
    }
    Ok(())
}
