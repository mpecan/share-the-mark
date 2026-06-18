use std::path::Path;
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::Duration;

use anyhow::{anyhow, Result};

// Daemon lifecycle is driven over the loopback HTTP API (not OS signals), so it
// behaves identically on macOS, Linux, and Windows. The only platform-specific
// bit is detaching the spawned child (see `detach`).

fn agent() -> ureq::Agent {
    ureq::builder().timeout(Duration::from_secs(2)).build()
}

pub fn is_up(port: u16) -> bool {
    agent()
        .get(&format!("http://127.0.0.1:{port}/health"))
        .call()
        .is_ok()
}

/// Ensure a daemon is running on `port`, starting one in the background if not.
pub fn ensure(port: u16, dir: &Path) -> Result<()> {
    if is_up(port) {
        Ok(())
    } else {
        start(port, dir)
    }
}

pub fn stop(port: u16) -> Result<()> {
    if !is_up(port) {
        return Err(anyhow!("no daemon responding on port {port}"));
    }
    agent()
        .post(&format!("http://127.0.0.1:{port}/shutdown"))
        .call()
        .map_err(|e| anyhow!("shutdown request failed: {e}"))?;
    Ok(())
}

pub fn start(port: u16, dir: &Path) -> Result<()> {
    if is_up(port) {
        return Ok(()); // already running
    }
    let exe = std::env::current_exe()?;
    let mut cmd = Command::new(exe);
    cmd.arg("serve")
        .arg("--port")
        .arg(port.to_string())
        .arg("--dir")
        .arg(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    detach(&mut cmd);
    cmd.spawn()
        .map_err(|e| anyhow!("failed to spawn daemon: {e}"))?;

    for _ in 0..50 {
        if is_up(port) {
            return Ok(());
        }
        sleep(Duration::from_millis(100));
    }
    Err(anyhow!("daemon did not become ready on port {port}"))
}

#[cfg(windows)]
fn detach(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn detach(_cmd: &mut Command) {
    // Null stdio already detaches the child sufficiently for CLI use on Unix.
}
