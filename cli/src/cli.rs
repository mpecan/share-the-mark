use std::path::PathBuf;

use anyhow::{anyhow, Result};
use clap::{Args, Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "stm",
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
        /// Brief id, as shown by `stm pending` / `stm list`.
        id: String,
        #[arg(long)]
        json: bool,
        #[arg(long)]
        keep_unread: bool,
        #[arg(long)]
        dir: Option<PathBuf>,
    },
    /// Open a page for annotation and wait for the user's feedback (for agents).
    Request {
        /// URL to open in the browser for annotation.
        url: String,
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

/// Port precedence: flag → `STM_PORT` → 8787.
pub fn resolve_port(flag: Option<u16>) -> u16 {
    flag.or_else(|| std::env::var("STM_PORT").ok().and_then(|s| s.parse().ok()))
        .unwrap_or(8787)
}

/// Idle-timeout precedence: flag → `STM_IDLE` → 0 (never). Seconds.
pub fn resolve_idle(flag: Option<u64>) -> u64 {
    flag.or_else(|| std::env::var("STM_IDLE").ok().and_then(|s| s.parse().ok()))
        .unwrap_or(0)
}

/// Store dir precedence: flag → `STM_DIR` → per-OS data directory.
pub fn resolve_dir(flag: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(dir) = flag {
        return Ok(dir);
    }
    if let Ok(dir) = std::env::var("STM_DIR") {
        return Ok(PathBuf::from(dir));
    }
    let project = directories::ProjectDirs::from("", "", "share-the-mark")
        .ok_or_else(|| anyhow!("cannot determine a data directory"))?;
    Ok(project.data_dir().to_path_buf())
}
