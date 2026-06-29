use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::thread::sleep;
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};

use crate::daemon;

const POLL_INTERVAL: Duration = Duration::from_millis(500);
/// Auto-started daemons self-shut-down after this idle window (no strays).
const AUTO_IDLE_SECS: u64 = 1800;

// `share-the-mark request <target>` — the agent-initiated flow. `<target>` is either a URL
// (opened as-is) or a local HTML file/dir, which the daemon serves on its loopback
// origin with the embed panel injected (Channel C, SPEC §13.6). Either way: register
// an open request, open the page, then block (short-polling) until the user annotates
// and the brief comes back — the command returning wakes a backgrounded agent.
pub fn run(
    port: u16,
    dir: &Path,
    target: &str,
    bundle: Option<PathBuf>,
    playwright: bool,
    timeout_secs: u64,
    json: bool,
) -> Result<()> {
    daemon::ensure(port, dir, AUTO_IDLE_SECS)?;
    // Resolve everything to absolute paths *before* talking to the daemon — it's a
    // separate process with its own (unrelated) working directory.
    let opening_url = is_url(target);
    let (id, open_url) = if opening_url {
        register(port, json!({ "url": target }), Some(target))?
    } else {
        if playwright {
            bail!(
                "--playwright is for remote URLs; a local artifact already serves the panel \
                 itself — drop --playwright"
            );
        }
        let artifact = resolve_local(target, bundle)?;
        register(
            port,
            json!({
                "artifactDir": artifact.dir,
                "entry": artifact.entry,
                "bundlePath": artifact.bundle,
            }),
            None,
        )?
    };

    // `--playwright`: drive a headed Playwright browser we control (no extension) and
    // keep its handle so the poll loop can notice if the user closes it. Otherwise open
    // the URL in the user's own browser (which needs the extension for a remote page).
    let mut runner: Option<Child> = None;
    if playwright {
        runner = Some(spawn_playwright_runner(port, &open_url)?);
        eprintln!(
            "Launched a Playwright browser for {open_url} — annotate it and click \
             \"Send to agent\". Close the window to cancel. Waiting…"
        );
    } else {
        open::that(&open_url).map_err(|e| anyhow!("failed to open the browser: {e}"))?;
        eprintln!("Opened {open_url} — annotate it and click \"Send to agent\". Waiting…");
        // A served local artifact injects the panel itself; only the URL flow relies on
        // the extension being installed, so the install hint is scoped to it.
        if opening_url {
            eprintln!("Nothing showing up? {}", crate::links::install_hint());
        }
    }

    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    loop {
        let body = poll(port, &id)?;
        match body["status"].as_str() {
            Some("fulfilled") => return print_brief(&body["brief"], json),
            Some("pending") => {}
            _ => bail!("request {id} is no longer tracked (did the daemon restart?)"),
        }
        // If the Playwright browser exited, the brief either just landed (it POSTs then
        // closes) or the user cancelled. Re-poll once to settle the race, then stop.
        if let Some(child) = runner.as_mut() {
            if child.try_wait()?.is_some() {
                let settled = poll(port, &id)?;
                if settled["status"].as_str() == Some("fulfilled") {
                    return print_brief(&settled["brief"], json);
                }
                bail!("the Playwright browser closed before a brief was sent");
            }
        }
        if Instant::now() >= deadline {
            bail!("timed out after {timeout_secs}s waiting for feedback");
        }
        sleep(POLL_INTERVAL);
    }
}

/// Write the baked Playwright runner to a temp file and launch it with `node`,
/// inheriting stdio so its prompts reach the user. Errors actionably when the build
/// has no runner baked in or when `node` isn't on PATH.
fn spawn_playwright_runner(port: u16, open_url: &str) -> Result<Child> {
    if crate::embed::PLAYWRIGHT_RUNNER.is_empty() {
        bail!("this build has no Playwright runner baked in — rebuild with `mise run cli:build`");
    }
    let path = std::env::temp_dir().join("share-the-mark-playwright-runner.mjs");
    std::fs::write(&path, crate::embed::PLAYWRIGHT_RUNNER).map_err(|e| {
        anyhow!(
            "could not stage the Playwright runner at {}: {e}",
            path.display()
        )
    })?;
    Command::new("node")
        .arg(&path)
        .arg("--url")
        .arg(open_url)
        .arg("--brief")
        .arg(format!("http://127.0.0.1:{port}/brief"))
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                anyhow!(
                    "`node` was not found on PATH. The --playwright flow needs Node and Playwright \
                     installed: `npm i -g playwright && playwright install chromium`."
                )
            } else {
                anyhow!("could not launch the Playwright runner: {e}")
            }
        })
}

fn is_url(target: &str) -> bool {
    target.starts_with("http://") || target.starts_with("https://")
}

struct LocalArtifact {
    dir: String,
    entry: String,
    /// Only set when `--bundle`/`SHARE_THE_MARK_EMBED_BUNDLE` overrides the binary's
    /// embedded bundle; `None` (serialized as `null`) tells the daemon to serve the
    /// embedded one.
    bundle: Option<String>,
}

/// Canonicalize a local artifact + the embed bundle to absolute paths (the daemon
/// never resolves relative to its own CWD). A dir serves its `index.html`.
fn resolve_local(target: &str, bundle: Option<PathBuf>) -> Result<LocalArtifact> {
    let path = std::fs::canonicalize(target)
        .map_err(|e| anyhow!("cannot find local artifact {target}: {e}"))?;
    let (dir, entry) = if path.is_dir() {
        if !path.join("index.html").is_file() {
            bail!("{} has no index.html to serve", path.display());
        }
        (path.clone(), "index.html".to_string())
    } else {
        let dir = path
            .parent()
            .ok_or_else(|| anyhow!("artifact {} has no parent directory", path.display()))?
            .to_path_buf();
        let entry = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| anyhow!("artifact has a non-UTF-8 file name"))?
            .to_string();
        (dir, entry)
    };
    Ok(LocalArtifact {
        dir: path_string(&dir),
        entry,
        bundle: resolve_bundle_override(bundle)?,
    })
}

/// The bundle override path, if the user gave one (`--bundle` or
/// `SHARE_THE_MARK_EMBED_BUNDLE`). `None` → the daemon serves its embedded bundle.
/// An explicit override that doesn't exist is a clear error (not a silent fallback).
fn resolve_bundle_override(bundle: Option<PathBuf>) -> Result<Option<String>> {
    let Some(candidate) =
        bundle.or_else(|| std::env::var_os("SHARE_THE_MARK_EMBED_BUNDLE").map(PathBuf::from))
    else {
        return Ok(None);
    };
    let resolved = std::fs::canonicalize(&candidate)
        .map_err(|e| anyhow!("--bundle {} not found: {e}", candidate.display()))?;
    Ok(Some(path_string(&resolved)))
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn client() -> ureq::Agent {
    ureq::builder().timeout(Duration::from_secs(5)).build()
}

/// Register the request and return `(id, open_url)`. `fallback_open` is the URL to
/// open if the daemon doesn't return `openUrl` — present for the remote flow (so an
/// older daemon still works), `None` for a local artifact (which *needs* the daemon's
/// served URL, so an old daemon is a clear, actionable error).
fn register(port: u16, body: Value, fallback_open: Option<&str>) -> Result<(String, String)> {
    let resp: Value = client()
        .post(&format!("http://127.0.0.1:{port}/request"))
        .send_json(body)
        .map_err(|e| anyhow!("could not register the request: {e}"))?
        .into_json()
        .map_err(|e| anyhow!("bad daemon response: {e}"))?;
    let id = resp["id"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| anyhow!("daemon did not return a request id"))?;
    let open_url = resp["openUrl"]
        .as_str()
        .map(str::to_string)
        .or_else(|| fallback_open.map(str::to_string))
        .ok_or_else(|| {
            anyhow!("the running daemon predates local-artifact support — run `share-the-mark stop` and retry")
        })?;
    Ok((id, open_url))
}

fn poll(port: u16, id: &str) -> Result<Value> {
    client()
        .get(&format!("http://127.0.0.1:{port}/request/{id}"))
        .call()
        .map_err(|e| anyhow!("daemon poll failed: {e}"))?
        .into_json()
        .map_err(|e| anyhow!("bad daemon response: {e}"))
}

fn print_brief(brief: &Value, json: bool) -> Result<()> {
    if json {
        println!("{brief}");
        return Ok(());
    }
    println!("{}", brief["markdown"].as_str().unwrap_or(""));
    if let Some(shot) = brief["screenshot"].as_str() {
        println!("\nScreenshot: {shot}");
    }
    Ok(())
}
