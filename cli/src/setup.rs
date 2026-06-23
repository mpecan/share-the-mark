//! `share-the-mark setup` — one-shot onboarding for the CLI half (SPEC §11.2).
//! Installs the Claude Code skill, points the user at the browser extension (the
//! other half), and starts the daemon in the background so onboarding ends with
//! everything wired up. The other direction lives in the extension's Options page.

use std::path::Path;

use anyhow::Result;

use crate::cli::{resolve_background_idle, resolve_dir, resolve_port};
use crate::{daemon, links, skill};

/// Build the setup report as blank-line-separated sections. Pure (no skill
/// install, no browser open, no network) so the wording stays unit-testable.
fn report(skill_path: &Path, daemon_up: bool, port: u16) -> String {
    let daemon = if daemon_up {
        format!("✓ daemon running on http://127.0.0.1:{port}")
    } else {
        // Reached only if the auto-start failed (sandbox, perms) — tell the user how.
        "Start the daemon when you're ready (runs in the background):\n  share-the-mark start"
            .to_string()
    };
    [
        format!(
            "✓ installed the Claude Code skill at {}",
            skill_path.display()
        ),
        format!(
            "Get the share-the-mark browser extension (the other half):\n  {}",
            links::HUB_URL
        ),
        daemon,
    ]
    .join("\n\n")
}

pub fn run(no_browser: bool) -> Result<()> {
    let skill_path = skill::install(None)?;
    let port = resolve_port(None);
    // Best-effort: start the daemon (background, self-cleaning idle) so the very
    // next "Send to agent" works. If it can't spawn, `report` falls back to the
    // manual hint. `ensure` is a no-op when a daemon is already up.
    if let Ok(dir) = resolve_dir(None) {
        let _ = daemon::ensure(port, &dir, resolve_background_idle(None));
    }
    println!("{}", report(&skill_path, daemon::is_up(port), port));
    if !no_browser {
        // Best-effort — never fail setup if no browser can be opened (headless, etc.).
        let _ = open::that(links::HUB_URL);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn report_names_the_skill_hub_and_start_hint_when_down() {
        let out = report(&PathBuf::from("/tmp/skill"), false, 8787);
        assert!(out.contains(links::HUB_URL));
        assert!(out.contains("/tmp/skill"));
        assert!(out.contains("share-the-mark start"));
    }

    #[test]
    fn report_shows_a_running_daemon_on_its_port() {
        let out = report(&PathBuf::from("/tmp/skill"), true, 9999);
        assert!(out.contains("127.0.0.1:9999"));
    }
}
