//! `share-the-mark setup` — one-shot onboarding for the CLI half (SPEC §11.2).
//! Installs the Claude Code skill, points the user at the browser extension (the
//! other half), and reports whether the daemon is already running. The other
//! direction lives in the extension's Options page.

use std::path::Path;

use anyhow::Result;

use crate::cli::resolve_port;
use crate::{daemon, links, skill};

/// Build the setup report lines. Pure (no skill install, no browser open, no
/// network) so the wording stays unit-testable.
fn report(skill_path: &Path, daemon_up: bool, port: u16) -> Vec<String> {
    let mut lines = vec![
        format!(
            "✓ installed the Claude Code skill at {}",
            skill_path.display()
        ),
        String::new(),
        format!(
            "Get the share-the-mark browser extension (the other half):\n  {}",
            links::HUB_URL
        ),
        String::new(),
    ];
    lines.push(if daemon_up {
        format!("✓ daemon already running on http://127.0.0.1:{port}")
    } else {
        "Start the daemon when you're ready:\n  share-the-mark serve".to_string()
    });
    lines
}

pub fn run(no_browser: bool) -> Result<()> {
    let skill_path = skill::install(None)?;
    let port = resolve_port(None);
    for line in report(&skill_path, daemon::is_up(port), port) {
        println!("{line}");
    }
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
    fn report_names_the_skill_hub_and_serve_hint_when_down() {
        let joined = report(&PathBuf::from("/tmp/skill"), false, 8787).join("\n");
        assert!(joined.contains(links::HUB_URL));
        assert!(joined.contains("/tmp/skill"));
        assert!(joined.contains("share-the-mark serve"));
    }

    #[test]
    fn report_shows_a_running_daemon_on_its_port() {
        let joined = report(&PathBuf::from("/tmp/skill"), true, 9999).join("\n");
        assert!(joined.contains("127.0.0.1:9999"));
    }
}
