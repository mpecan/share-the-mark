use std::path::Path;
use std::thread::sleep;
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Result};
use serde_json::Value;

use crate::daemon;

const POLL_INTERVAL: Duration = Duration::from_millis(500);
/// Auto-started daemons self-shut-down after this idle window (no strays).
const AUTO_IDLE_SECS: u64 = 1800;

// `stm request <url>` — the agent-initiated flow. Register an open request with
// the daemon, open the page in the browser, then block (short-polling) until the
// user annotates it and clicks "Send to agent". The daemon matches the incoming
// brief by origin and fulfills the request; this returns the brief, which — by
// the command returning — wakes a backgrounded agent (e.g. Claude Code).
pub fn run(port: u16, dir: &Path, url: &str, timeout_secs: u64, json: bool) -> Result<()> {
    daemon::ensure(port, dir, AUTO_IDLE_SECS)?;
    let id = create(port, url)?;
    open::that(url).map_err(|e| anyhow!("failed to open the browser: {e}"))?;
    eprintln!("Opened {url} — annotate it and click \"Send to agent\". Waiting…");

    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    loop {
        let body = poll(port, &id)?;
        match body["status"].as_str() {
            Some("fulfilled") => return print_brief(&body["brief"], json),
            Some("pending") => {}
            _ => bail!("request {id} is no longer tracked (did the daemon restart?)"),
        }
        if Instant::now() >= deadline {
            bail!("timed out after {timeout_secs}s waiting for feedback");
        }
        sleep(POLL_INTERVAL);
    }
}

fn client() -> ureq::Agent {
    ureq::builder().timeout(Duration::from_secs(5)).build()
}

fn create(port: u16, url: &str) -> Result<String> {
    let body: Value = client()
        .post(&format!("http://127.0.0.1:{port}/request"))
        .send_json(serde_json::json!({ "url": url }))
        .map_err(|e| anyhow!("could not register the request: {e}"))?
        .into_json()
        .map_err(|e| anyhow!("bad daemon response: {e}"))?;
    body["id"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| anyhow!("daemon did not return a request id"))
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
