use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::requests::Requests;
use crate::store::{new_id, now_millis, Meta, Store};

/// The JSON the extension POSTs to `/brief`.
#[derive(Deserialize)]
struct BriefIn {
    markdown: String,
    meta: MetaIn,
    #[serde(rename = "imageBase64")]
    image_base64: String,
}

#[derive(Deserialize)]
struct MetaIn {
    url: String,
    title: String,
    #[serde(rename = "capturedAt")]
    captured_at: i64,
}

/// The oldest extension version this daemon is compatible with. Surfaced from
/// `/health` so the extension can warn (rather than silently misbehave) when the
/// two halves drift — SPEC §11.4. A declared floor, not lockstep.
const MIN_EXTENSION: &str = "1.0.0";

/// Bind the loopback ingest server. Port 0 picks an ephemeral port.
pub fn bind(port: u16) -> Result<Server> {
    let addr = format!("127.0.0.1:{port}");
    Server::http(&addr).map_err(|e| anyhow!("cannot bind {addr}: {e}"))
}

/// The actual port a bound server is listening on (used by tests with port 0).
#[cfg(test)]
pub fn port_of(server: &Server) -> u16 {
    server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0)
}

/// Serve until `running` is cleared (Ctrl-C or `/shutdown`), or — when
/// `idle_timeout` is non-zero — after that long with no handled request. The
/// idle exit lets auto-started daemons clean themselves up; explicit `share-the-mark serve`
/// passes a zero timeout and runs until stopped.
pub fn run(
    server: Server,
    store: Store,
    running: Arc<AtomicBool>,
    idle_timeout: Duration,
) -> Result<()> {
    let mut requests = Requests::default();
    let mut last_activity = Instant::now();
    while running.load(Ordering::SeqCst) {
        match server.recv_timeout(Duration::from_millis(200)) {
            Ok(Some(request)) => {
                last_activity = Instant::now();
                handle(request, &store, &mut requests, &running);
            }
            Ok(None) => {
                if !idle_timeout.is_zero() && last_activity.elapsed() >= idle_timeout {
                    break;
                }
            }
            Err(e) => return Err(anyhow!("server error: {e}")),
        }
    }
    Ok(())
}

fn handle(mut request: Request, store: &Store, requests: &mut Requests, running: &Arc<AtomicBool>) {
    let method = request.method().clone();
    let url = request.url().to_string();
    let response = match (&method, url.as_str()) {
        (Method::Options, _) => json_response(204, json!({})),
        (Method::Get, "/health") => json_response(
            200,
            json!({
                "ok": true,
                "version": env!("CARGO_PKG_VERSION"),
                "minExtension": MIN_EXTENSION,
            }),
        ),
        (Method::Post, "/brief") => ingest(&mut request, store, requests),
        (Method::Post, "/request") => create_request(&mut request, requests),
        (Method::Get, path) if path.starts_with("/request/") => {
            request_status(&path["/request/".len()..], store, requests)
        }
        (Method::Post, "/shutdown") => {
            running.store(false, Ordering::SeqCst);
            json_response(200, json!({ "ok": true }))
        }
        _ => json_response(404, json!({ "error": "not found" })),
    };
    let _ = request.respond(response);
}

fn ingest(
    request: &mut Request,
    store: &Store,
    requests: &mut Requests,
) -> Response<Cursor<Vec<u8>>> {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        return json_response(400, json!({ "error": "unreadable body" }));
    }
    let brief: BriefIn = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(e) => return json_response(400, json!({ "error": format!("bad json: {e}") })),
    };
    let png = match decode_image(&brief.image_base64) {
        Ok(bytes) => bytes,
        Err(e) => return json_response(400, json!({ "error": e })),
    };
    let received_at = now_millis();
    let id = unique_id(store, received_at);
    let meta = Meta {
        id: id.clone(),
        url: brief.meta.url,
        title: brief.meta.title,
        captured_at: brief.meta.captured_at,
        received_at,
        read: false,
    };
    if let Err(e) = store.save(&brief.markdown, &png, &meta) {
        return json_response(500, json!({ "error": e.to_string() }));
    }
    // If an agent is waiting for this origin, route the brief to it (and mark it
    // read — it went straight to the agent rather than the pending queue).
    if requests.fulfill(&meta.url, &id) {
        let _ = store.mark_read(&id);
    }
    json_response(200, json!({ "id": id }))
}

#[derive(Deserialize)]
struct RequestIn {
    url: String,
}

fn create_request(request: &mut Request, requests: &mut Requests) -> Response<Cursor<Vec<u8>>> {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        return json_response(400, json!({ "error": "unreadable body" }));
    }
    let parsed: RequestIn = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(e) => return json_response(400, json!({ "error": format!("bad json: {e}") })),
    };
    let id = requests.create(&parsed.url, now_millis());
    json_response(200, json!({ "id": id }))
}

fn request_status(id: &str, store: &Store, requests: &Requests) -> Response<Cursor<Vec<u8>>> {
    let Some(request) = requests.get(id) else {
        return json_response(404, json!({ "status": "unknown" }));
    };
    let Some(brief_id) = &request.brief_id else {
        return json_response(200, json!({ "status": "pending" }));
    };
    match store.get(brief_id) {
        Ok(Some(brief)) => json_response(
            200,
            json!({
                "status": "fulfilled",
                "brief": {
                    "id": brief.meta.id,
                    "url": brief.meta.url,
                    "title": brief.meta.title,
                    "capturedAt": brief.meta.captured_at,
                    "markdown": brief.markdown,
                    "screenshot": brief.screenshot.display().to_string(),
                }
            }),
        ),
        _ => json_response(200, json!({ "status": "fulfilled" })),
    }
}

fn decode_image(b64: &str) -> Result<Vec<u8>, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine as _;
    // Tolerate an optional `data:image/png;base64,` prefix.
    let payload = b64.rsplit(',').next().unwrap_or(b64);
    STANDARD
        .decode(payload)
        .map_err(|e| format!("bad base64 image: {e}"))
}

fn unique_id(store: &Store, received_at: i64) -> String {
    let base = new_id(received_at);
    if store.get(&base).map(|b| b.is_none()).unwrap_or(true) {
        return base;
    }
    for suffix in 1..1000 {
        let candidate = format!("{base}{suffix}");
        if store.get(&candidate).map(|b| b.is_none()).unwrap_or(true) {
            return candidate;
        }
    }
    base
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn json_response(status: u16, body: Value) -> Response<Cursor<Vec<u8>>> {
    let data = serde_json::to_vec(&body).unwrap_or_default();
    Response::from_data(data)
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json"))
        .with_header(header("Access-Control-Allow-Origin", "*"))
        .with_header(header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"))
        .with_header(header("Access-Control-Allow-Headers", "Content-Type"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use tempfile::tempdir;

    fn b64(bytes: &[u8]) -> String {
        use base64::engine::general_purpose::STANDARD;
        use base64::Engine as _;
        STANDARD.encode(bytes)
    }

    #[test]
    fn ingests_persists_and_shuts_down() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let server = bind(0).unwrap();
        let port = port_of(&server);
        let running = Arc::new(AtomicBool::new(true));
        let worker = {
            let running = running.clone();
            thread::spawn(move || run(server, store, running, Duration::ZERO).unwrap())
        };

        let base = format!("http://127.0.0.1:{port}");
        let health = ureq::get(&format!("{base}/health")).call().unwrap();
        assert_eq!(health.status(), 200);
        let health_body = health.into_json::<Value>().unwrap();
        assert_eq!(health_body["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(health_body["minExtension"], MIN_EXTENSION);

        let res = ureq::post(&format!("{base}/brief"))
            .send_json(json!({
                "markdown": "# Brief\n",
                "meta": { "url": "https://x.test/p", "title": "X", "capturedAt": 5 },
                "imageBase64": b64(b"PNG"),
            }))
            .unwrap();
        let id = res.into_json::<Value>().unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();

        let check = Store::new(dir.path().to_path_buf());
        let brief = check.get(&id).unwrap().expect("persisted");
        assert_eq!(brief.markdown, "# Brief\n");
        assert_eq!(brief.meta.captured_at, 5);
        assert_eq!(std::fs::read(brief.screenshot).unwrap(), b"PNG");

        ureq::post(&format!("{base}/shutdown")).call().unwrap();
        worker.join().unwrap();
    }

    #[test]
    fn fulfills_an_open_request_with_a_same_origin_brief() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let server = bind(0).unwrap();
        let port = port_of(&server);
        let running = Arc::new(AtomicBool::new(true));
        let worker = {
            let running = running.clone();
            thread::spawn(move || run(server, store, running, Duration::ZERO).unwrap())
        };
        let base = format!("http://127.0.0.1:{port}");

        // Agent registers a request for an origin.
        let req = ureq::post(&format!("{base}/request"))
            .send_json(json!({ "url": "https://x.test/checkout" }))
            .unwrap()
            .into_json::<Value>()
            .unwrap();
        let request_id = req["id"].as_str().unwrap().to_string();

        // Not fulfilled yet.
        let pending = ureq::get(&format!("{base}/request/{request_id}"))
            .call()
            .unwrap()
            .into_json::<Value>()
            .unwrap();
        assert_eq!(pending["status"], "pending");

        // A same-origin brief arrives ("Send to agent").
        ureq::post(&format!("{base}/brief"))
            .send_json(json!({
                "markdown": "# Fix it\n",
                "meta": { "url": "https://x.test/cart", "title": "Cart", "capturedAt": 1 },
                "imageBase64": b64(b"PNG"),
            }))
            .unwrap();

        // Now fulfilled, carrying the brief.
        let done = ureq::get(&format!("{base}/request/{request_id}"))
            .call()
            .unwrap()
            .into_json::<Value>()
            .unwrap();
        assert_eq!(done["status"], "fulfilled");
        assert_eq!(done["brief"]["markdown"], "# Fix it\n");

        ureq::post(&format!("{base}/shutdown")).call().unwrap();
        worker.join().unwrap();
    }

    #[test]
    fn shuts_down_after_the_idle_timeout() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let server = bind(0).unwrap();
        let running = Arc::new(AtomicBool::new(true));
        // Short idle window, no traffic → the loop should exit on its own.
        let worker =
            thread::spawn(move || run(server, store, running, Duration::from_millis(150)).unwrap());
        for _ in 0..50 {
            if worker.is_finished() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        assert!(worker.is_finished(), "idle daemon did not shut itself down");
        worker.join().unwrap();
    }

    #[test]
    fn rejects_bad_json() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let server = bind(0).unwrap();
        let port = port_of(&server);
        let running = Arc::new(AtomicBool::new(true));
        let worker = {
            let running = running.clone();
            thread::spawn(move || run(server, store, running, Duration::ZERO).unwrap())
        };

        let err = ureq::post(&format!("http://127.0.0.1:{port}/brief"))
            .send_string("not json")
            .unwrap_err();
        assert!(matches!(err, ureq::Error::Status(400, _)));

        ureq::post(&format!("http://127.0.0.1:{port}/shutdown"))
            .call()
            .unwrap();
        worker.join().unwrap();
    }
}
