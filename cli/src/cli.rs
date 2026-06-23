use std::path::PathBuf;

use anyhow::{anyhow, Result};
use clap::{Args, Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "share-the-mark",
    version,
    about = "share-the-mark: receive design-feedback change-briefs and expose them to a coding agent"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// Run the ingest daemon in the foreground (Ctrl-C to stop).
    Serve(ServeArgs),
    /// Start the ingest daemon in the background.
    Start(ServeArgs),
    /// Stop the background daemon.
    Stop {
        #[arg(long)]
        port: Option<u16>,
    },
    /// Report whether the daemon is running.
    Status {
        #[arg(long)]
        port: Option<u16>,
    },
    /// List briefs that haven't been read yet.
    Pending {
        #[arg(long)]
        dir: Option<PathBuf>,
    },
    /// List recent briefs (use --all for every brief).
    List {
        #[arg(long)]
        all: bool,
        #[arg(long)]
        dir: Option<PathBuf>,
    },
    /// Print a brief's Markdown and screenshot path (marks it read).
    Show {
        /// Brief id, as shown by `share-the-mark pending` / `share-the-mark list`.
        id: String,
        #[arg(long)]
        json: bool,
        #[arg(long)]
        keep_unread: bool,
        #[arg(long)]
        dir: Option<PathBuf>,
    },
    /// Open a page (URL) or serve a local artifact for annotation, and wait for feedback.
    Request {
        /// A URL to open, or a path to a local HTML file/dir to serve and annotate.
        target: String,
        /// Embed bundle to inject when serving a local artifact
        /// (default: .output/embed/local.global.js; or SHARE_THE_MARK_EMBED_BUNDLE).
        #[arg(long)]
        bundle: Option<PathBuf>,
        /// Annotate a remote URL in a headed Playwright browser instead of your own
        /// (no extension needed). Requires Node + Playwright on PATH.
        #[arg(long)]
        playwright: bool,
        #[arg(long)]
        json: bool,
        /// How long to wait for feedback before giving up.
        #[arg(long, default_value_t = 600)]
        timeout: u64,
        #[arg(long)]
        port: Option<u16>,
        #[arg(long)]
        dir: Option<PathBuf>,
    },
    /// Manage the bundled Claude Code skill.
    Skill {
        #[command(subcommand)]
        command: SkillCommand,
    },
    /// Install the skill, open the extension page, and report daemon status.
    Setup {
        /// Don't open the extension page in a browser (just print the link).
        #[arg(long)]
        no_browser: bool,
    },
}

#[derive(Args)]
pub struct ServeArgs {
    #[arg(long)]
    pub port: Option<u16>,
    #[arg(long)]
    pub dir: Option<PathBuf>,
    /// Shut down after this many seconds with no activity (0 = never).
    #[arg(long)]
    pub idle_timeout: Option<u64>,
}

#[derive(Subcommand)]
pub enum SkillCommand {
    /// Install the skill (defaults to the per-OS Claude skills directory).
    Install {
        #[arg(long)]
        dir: Option<PathBuf>,
    },
}

/// Port precedence: flag → `SHARE_THE_MARK_PORT` → 8787.
pub fn resolve_port(flag: Option<u16>) -> u16 {
    flag.or_else(|| {
        std::env::var("SHARE_THE_MARK_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
    })
    .unwrap_or(8787)
}

/// Idle window for a backgrounded daemon (`start`, `setup`) when nothing is
/// configured. Generous on purpose: the extension's connect view pings `/health`
/// every couple of seconds while it's open, which resets the idle timer — so a
/// daemon stays warm during active use and only self-cleans after a long gap,
/// rather than lingering forever. 3 hours. `0` (flag/env) disables idle-exit.
pub const BACKGROUND_IDLE_SECS: u64 = 3 * 60 * 60;

fn idle_or(flag: Option<u64>, default: u64) -> u64 {
    flag.or_else(|| {
        std::env::var("SHARE_THE_MARK_IDLE")
            .ok()
            .and_then(|s| s.parse().ok())
    })
    .unwrap_or(default)
}

/// Idle-timeout precedence for foreground `serve`: flag → `SHARE_THE_MARK_IDLE` →
/// 0 (never — runs until Ctrl-C). Seconds.
pub fn resolve_idle(flag: Option<u64>) -> u64 {
    idle_or(flag, 0)
}

/// Idle-timeout precedence for backgrounded daemons (`start`, `setup`): flag →
/// `SHARE_THE_MARK_IDLE` → [`BACKGROUND_IDLE_SECS`]. Seconds. A self-cleaning
/// default so a forgotten `start` doesn't leave a stray daemon running.
pub fn resolve_background_idle(flag: Option<u64>) -> u64 {
    idle_or(flag, BACKGROUND_IDLE_SECS)
}

/// Store dir precedence: flag → `SHARE_THE_MARK_DIR` → per-OS data directory.
pub fn resolve_dir(flag: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(dir) = flag {
        return Ok(dir);
    }
    if let Ok(dir) = std::env::var("SHARE_THE_MARK_DIR") {
        return Ok(PathBuf::from(dir));
    }
    let project = directories::ProjectDirs::from("", "", "share-the-mark")
        .ok_or_else(|| anyhow!("cannot determine a data directory"))?;
    Ok(project.data_dir().to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_idle_flag_overrides_both_defaults() {
        // A flag wins regardless of which default the resolver carries.
        assert_eq!(resolve_idle(Some(42)), 42);
        assert_eq!(resolve_background_idle(Some(42)), 42);
        // `0` (run forever) is honoured, not treated as "unset".
        assert_eq!(resolve_background_idle(Some(0)), 0);
    }

    #[test]
    fn background_idle_is_generous_and_foreground_runs_forever() {
        // Distinct defaults: foreground `serve` never idle-exits; a backgrounded
        // daemon self-cleans after the generous window.
        assert_eq!(BACKGROUND_IDLE_SECS, 3 * 60 * 60);
        assert!(BACKGROUND_IDLE_SECS > 0);
    }
}
