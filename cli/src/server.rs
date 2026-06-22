use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::requests::{Artifact, Requests};
use crate::store::{new_id, now_millis, Meta, Store};

// CSP emitted on served artifact HTML (Channel C, SPEC §13.6). Tight by default —
// these are local dev artifacts. `'unsafe-inline'` style covers React + the
// shadow-root <style>; `data:`/`blob:` cover the capture + panel preview;
// `connect-src 'self'` permits the same-origin POST /brief.
const ARTIFACT_CSP: &str = "default-src 'self'; script-src 'self' 'unsafe-inline'; \
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:";

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

/// The actual port a bound server is listening on (port 0 picks an ephemeral one;
/// the artifact loop needs the real port to build the loopback origin + open URL).
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
    let port = port_of(&server);
    let mut requests = Requests::default();
    let mut last_activity = Instant::now();
    while running.load(Ordering::SeqCst) {
        match server.recv_timeout(Duration::from_millis(200)) {
            Ok(Some(request)) => {
                last_activity = Instant::now();
                handle(request, port, &store, &mut requests, &running);
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

fn handle(
    mut request: Request,
    port: u16,
    store: &Store,
    requests: &mut Requests,
    running: &Arc<AtomicBool>,
) {
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
        (Method::Post, "/request") => create_request(&mut request, port, requests),
        (Method::Get, path) if path.starts_with("/request/") => {
            request_status(&path["/request/".len()..], store, requests)
        }
        (Method::Get, path) if path.starts_with("/artifact/") => serve_artifact(path, requests),
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
    // If an agent is waiting for this brief, route it there (and mark it read — it
    // went straight to the agent, not the pending queue). A local artifact carries
    // an `…/artifact/<request-id>/…` URL, so route by that exact id (locals all share
    // the loopback origin). The `|| fulfill` keeps the remote flow working for a real
    // page whose own path happens to contain `/artifact/` (no request has that id, so
    // `fulfill_by_id` misses and we fall back to origin matching).
    let routed = match artifact_id_in(&meta.url) {
        Some(req_id) => requests.fulfill_by_id(&req_id, &id) || requests.fulfill(&meta.url, &id),
        None => requests.fulfill(&meta.url, &id),
    };
    if routed {
        let _ = store.mark_read(&id);
    }
    json_response(200, json!({ "id": id }))
}

#[derive(Deserialize)]
struct RequestIn {
    url: Option<String>,
    #[serde(rename = "artifactDir")]
    artifact_dir: Option<String>,
    entry: Option<String>,
    #[serde(rename = "bundlePath")]
    bundle_path: Option<String>,
}

fn create_request(
    request: &mut Request,
    port: u16,
    requests: &mut Requests,
) -> Response<Cursor<Vec<u8>>> {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        return json_response(400, json!({ "error": "unreadable body" }));
    }
    let parsed: RequestIn = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(e) => return json_response(400, json!({ "error": format!("bad json: {e}") })),
    };
    // Local artifact (Channel C): the daemon serves it and the page POSTs back
    // same-origin. Paths arrive already absolute (canonicalized by the CLI).
    if let (Some(dir), Some(entry), Some(bundle)) =
        (parsed.artifact_dir, parsed.entry, parsed.bundle_path)
    {
        let origin = format!("http://127.0.0.1:{port}");
        let artifact = Artifact {
            dir: PathBuf::from(dir),
            bundle: PathBuf::from(bundle),
        };
        let id = requests.create_local(&origin, artifact, now_millis());
        let open_url = format!("{origin}/artifact/{id}/{entry}");
        return json_response(200, json!({ "id": id, "openUrl": open_url }));
    }
    // Remote URL (the existing flow): open it as-is.
    match parsed.url {
        Some(url) => {
            let id = requests.create(&url, now_millis());
            json_response(200, json!({ "id": id, "openUrl": url }))
        }
        None => json_response(
            400,
            json!({ "error": "request needs a url or an artifact" }),
        ),
    }
}

/// Extract `<id>` from a `…/artifact/<id>/…` URL, if present.
fn artifact_id_in(url: &str) -> Option<String> {
    let after = url.split_once("/artifact/")?.1;
    let id = after.split('/').next().unwrap_or("");
    (!id.is_empty()).then(|| id.to_string())
}

/// Serve a registered artifact's files (Channel C). `GET /artifact/<id>/<rest>`:
/// `<rest> == __stm/embed.js` serves that request's embed bundle; otherwise a file
/// under the request's (absolute, canonicalized) artifact dir, with the embed
/// `<script>` injected into HTML. GET-only, confined to the registered dir.
fn serve_artifact(path: &str, requests: &Requests) -> Response<Cursor<Vec<u8>>> {
    let rest = &path["/artifact/".len()..];
    let Some((id, sub)) = rest.split_once('/') else {
        return not_found();
    };
    let Some(artifact) = requests.get(id).and_then(|r| r.artifact.as_ref()) else {
        return not_found();
    };
    if sub == "__stm/embed.js" {
        return match std::fs::read(&artifact.bundle) {
            Ok(bytes) => asset_response(200, bytes, "text/javascript"),
            Err(_) => json_response(404, json!({ "error": "embed bundle not found" })),
        };
    }
    let Some(file) = safe_join(&artifact.dir, sub) else {
        return not_found();
    };
    let Ok(bytes) = std::fs::read(&file) else {
        return not_found();
    };
    let ctype = content_type(&file);
    if ctype.starts_with("text/html") {
        let tag = format!("<script src=\"/artifact/{id}/__stm/embed.js\"></script>");
        Response::from_data(inject_before_body(bytes, &tag))
            .with_status_code(200)
            .with_header(header("Content-Type", ctype))
            .with_header(header("Content-Security-Policy", ARTIFACT_CSP))
    } else {
        asset_response(200, bytes, ctype)
    }
}

/// Join `rel` under `base` only if it stays inside `base`. Rejects traversal,
/// absolute, empty, encoded, and (via canonicalize) symlink-escape paths.
fn safe_join(base: &Path, rel: &str) -> Option<PathBuf> {
    if rel.is_empty() || rel.contains('%') || rel.contains('\\') || rel.contains('\0') {
        return None;
    }
    for segment in rel.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return None;
        }
    }
    let target = std::fs::canonicalize(base.join(rel)).ok()?;
    let base = std::fs::canonicalize(base).ok()?;
    target.starts_with(&base).then_some(target)
}

fn inject_before_body(html: Vec<u8>, tag: &str) -> Vec<u8> {
    let at = find_subslice(&html, b"</body>").or_else(|| find_subslice(&html, b"</html>"));
    match at {
        Some(index) => {
            let mut out = Vec::with_capacity(html.len() + tag.len());
            out.extend_from_slice(&html[..index]);
            out.extend_from_slice(tag.as_bytes());
            out.extend_from_slice(&html[index..]);
            out
        }
        None => {
            let mut out = html;
            out.extend_from_slice(tag.as_bytes());
            out
        }
    }
}

// Case-insensitive byte search (HTML tags like `</body>` may be any case). Scans in
// place — no lowercased copy of the whole document.
fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|w| w.eq_ignore_ascii_case(needle))
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "json" | "map" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn not_found() -> Response<Cursor<Vec<u8>>> {
    json_response(404, json!({ "error": "not found" }))
}

/// A static (non-JSON-API) response: no `Access-Control-Allow-Origin`, since the
/// served page calls `/brief` same-origin. (The extension's cross-origin POST still
/// gets `*` from `json_response`.)
fn asset_response(status: u16, body: Vec<u8>, content_type: &str) -> Response<Cursor<Vec<u8>>> {
    Response::from_data(body)
        .with_status_code(status)
        .with_header(header("Content-Type", content_type))
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

    fn spawn(dir: &Path) -> (u16, thread::JoinHandle<()>) {
        let store = Store::new(dir.to_path_buf());
        let server = bind(0).unwrap();
        let port = port_of(&server);
        let running = Arc::new(AtomicBool::new(true));
        let worker = thread::spawn(move || run(server, store, running, Duration::ZERO).unwrap());
        (port, worker)
    }

    fn stop(port: u16, worker: thread::JoinHandle<()>) {
        ureq::post(&format!("http://127.0.0.1:{port}/shutdown"))
            .call()
            .unwrap();
        worker.join().unwrap();
    }

    fn register_local(port: u16, dir: &Path, bundle: &Path) -> (String, String) {
        let resp = ureq::post(&format!("http://127.0.0.1:{port}/request"))
            .send_json(json!({
                "artifactDir": dir.to_string_lossy(),
                "entry": "index.html",
                "bundlePath": bundle.to_string_lossy(),
            }))
            .unwrap()
            .into_json::<Value>()
            .unwrap();
        let id = resp["id"].as_str().unwrap().to_string();
        let open_url = resp["openUrl"].as_str().unwrap().to_string();
        (id, open_url)
    }

    #[test]
    fn serves_a_local_artifact_with_the_embed_injected() {
        let dir = tempdir().unwrap();
        std::fs::write(
            dir.path().join("index.html"),
            "<html><body><h1>Hi</h1></body></html>",
        )
        .unwrap();
        let bundle = dir.path().join("local.global.js");
        std::fs::write(&bundle, "/* embed */").unwrap();
        let (port, worker) = spawn(dir.path());

        let (id, open_url) = register_local(port, dir.path(), &bundle);
        assert!(open_url.ends_with(&format!("/artifact/{id}/index.html")));

        let page = ureq::get(&open_url).call().unwrap();
        assert_eq!(page.status(), 200);
        let csp = page
            .header("Content-Security-Policy")
            .unwrap_or("")
            .to_string();
        assert!(csp.contains("default-src 'self'"));
        let body = page.into_string().unwrap();
        // The embed script is injected just before </body>.
        assert!(body.contains(&format!(
            "<script src=\"/artifact/{id}/__stm/embed.js\"></script></body>"
        )));
        assert!(body.contains("<h1>Hi</h1>"));

        // The bundle route serves that request's registered bundle.
        let js = ureq::get(&format!(
            "http://127.0.0.1:{port}/artifact/{id}/__stm/embed.js"
        ))
        .call()
        .unwrap();
        assert_eq!(js.header("Content-Type"), Some("text/javascript"));
        assert_eq!(js.into_string().unwrap(), "/* embed */");

        stop(port, worker);
    }

    #[test]
    fn a_local_brief_fulfills_its_request_by_id() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), "<html><body></body></html>").unwrap();
        let bundle = dir.path().join("b.js");
        std::fs::write(&bundle, "x").unwrap();
        let (port, worker) = spawn(dir.path());
        let (id, open_url) = register_local(port, dir.path(), &bundle);

        // The panel POSTs the brief same-origin; meta.url is the served artifact URL.
        ureq::post(&format!("http://127.0.0.1:{port}/brief"))
            .send_json(json!({
                "markdown": "# Local fix\n",
                "meta": { "url": open_url, "title": "Local", "capturedAt": 1 },
                "imageBase64": b64(b"PNG"),
            }))
            .unwrap();

        let done = ureq::get(&format!("http://127.0.0.1:{port}/request/{id}"))
            .call()
            .unwrap()
            .into_json::<Value>()
            .unwrap();
        assert_eq!(done["status"], "fulfilled");
        assert_eq!(done["brief"]["markdown"], "# Local fix\n");

        stop(port, worker);
    }

    #[test]
    fn rejects_encoded_path_traversal() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), "<html><body></body></html>").unwrap();
        let bundle = dir.path().join("b.js");
        std::fs::write(&bundle, "x").unwrap();
        let (port, worker) = spawn(dir.path());
        let (id, _) = register_local(port, dir.path(), &bundle);

        // A percent-encoded `..` must never escape the artifact dir.
        let err = ureq::get(&format!(
            "http://127.0.0.1:{port}/artifact/{id}/%2e%2e%2fsecret"
        ))
        .call()
        .unwrap_err();
        assert!(matches!(err, ureq::Error::Status(404, _)));

        stop(port, worker);
    }

    #[test]
    fn safe_join_confines_to_the_base_dir() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("ok.txt"), "x").unwrap();
        assert!(safe_join(dir.path(), "ok.txt").is_some());
        assert!(safe_join(dir.path(), "../ok.txt").is_none());
        assert!(safe_join(dir.path(), "a/../b").is_none());
        assert!(safe_join(dir.path(), "/etc/passwd").is_none());
        assert!(safe_join(dir.path(), "a%2e").is_none());
        assert!(safe_join(dir.path(), "back\\slash").is_none());
        assert!(safe_join(dir.path(), "").is_none());
        assert!(safe_join(dir.path(), "missing.txt").is_none());
    }
}
