mod cli;
mod daemon;
mod request;
mod requests;
mod server;
mod skill;
mod store;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Result};
use clap::Parser;

use cli::{resolve_dir, resolve_idle, resolve_port, Cli, Command, SkillCommand};
use store::Store;

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Serve(args) => serve(
            resolve_port(args.port),
            resolve_dir(args.dir)?,
            Duration::from_secs(resolve_idle(args.idle_timeout)),
        ),
        Command::Start(args) => {
            let port = resolve_port(args.port);
            daemon::start(
                port,
                &resolve_dir(args.dir)?,
                resolve_idle(args.idle_timeout),
            )?;
            println!("share-the-mark daemon running on http://127.0.0.1:{port}");
            Ok(())
        }
        Command::Stop { port } => {
            let port = resolve_port(port);
            daemon::stop(port)?;
            println!("stopped the daemon on port {port}");
            Ok(())
        }
        Command::Status { port } => {
            let port = resolve_port(port);
            if daemon::is_up(port) {
                println!("running on http://127.0.0.1:{port}");
            } else {
                println!("not running (port {port})");
            }
            Ok(())
        }
        Command::Request {
            url,
            json,
            timeout,
            port,
            dir,
        } => request::run(resolve_port(port), &resolve_dir(dir)?, &url, timeout, json),
        Command::Pending { dir } => list_briefs(resolve_dir(dir)?, false, true),
        Command::List { all, dir } => list_briefs(resolve_dir(dir)?, all, false),
        Command::Show {
            id,
            json,
            keep_unread,
            dir,
        } => show_brief(resolve_dir(dir)?, &id, json, keep_unread),
        Command::Skill { command } => match command {
            SkillCommand::Install { dir } => {
                let path = skill::install(dir)?;
                println!("installed the share-the-mark skill at {}", path.display());
                Ok(())
            }
        },
    }
}

fn serve(port: u16, dir: PathBuf, idle_timeout: Duration) -> Result<()> {
    let server = server::bind(port)?;
    let running = Arc::new(AtomicBool::new(true));
    {
        let running = running.clone();
        let _ = ctrlc::set_handler(move || running.store(false, Ordering::SeqCst));
    }
    eprintln!(
        "share-the-mark daemon listening on http://127.0.0.1:{port}  (store: {})",
        dir.display()
    );
    server::run(server, Store::new(dir), running, idle_timeout)
}

fn list_briefs(dir: PathBuf, all: bool, pending_only: bool) -> Result<()> {
    let store = Store::new(dir);
    let mut metas = if pending_only {
        store.pending()?
    } else {
        store.list()?
    };
    if !pending_only && !all {
        metas.truncate(20);
    }
    if metas.is_empty() {
        println!(
            "{}",
            if pending_only {
                "no unread briefs"
            } else {
                "no briefs"
            }
        );
        return Ok(());
    }
    for meta in metas {
        let unread = if meta.read { " " } else { "*" };
        println!(
            "{unread} {}  {}  {}",
            meta.id,
            host_of(&meta.url),
            iso_utc(meta.captured_at)
        );
    }
    Ok(())
}

fn show_brief(dir: PathBuf, id: &str, json: bool, keep_unread: bool) -> Result<()> {
    let store = Store::new(dir);
    let Some(brief) = store.get(id)? else {
        bail!("no brief with id '{id}' (try `stm pending`)");
    };
    if json {
        let value = serde_json::json!({
            "id": brief.meta.id,
            "url": brief.meta.url,
            "title": brief.meta.title,
            "capturedAt": brief.meta.captured_at,
            "markdown": brief.markdown,
            "screenshot": brief.screenshot.display().to_string(),
        });
        println!("{value}");
    } else {
        println!("{}", brief.markdown);
        println!("\nScreenshot: {}", brief.screenshot.display());
    }
    if !keep_unread {
        store.mark_read(id)?;
    }
    Ok(())
}

fn host_of(url: &str) -> String {
    let after_scheme = url.split("://").nth(1).unwrap_or(url);
    after_scheme
        .split('/')
        .next()
        .unwrap_or(after_scheme)
        .to_string()
}

/// Format a millisecond epoch as `YYYY-MM-DD HH:MM:SSZ` (UTC) without a date
/// dependency — Howard Hinnant's civil-from-days algorithm.
fn iso_utc(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let days = secs.div_euclid(86_400);
    let tod = secs.rem_euclid(86_400);
    let (hour, min, sec) = (tod / 3600, (tod % 3600) / 60, tod % 60);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02} {hour:02}:{min:02}:{sec:02}Z")
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let day = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let month = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    (if month <= 2 { year + 1 } else { year }, month, day)
}
