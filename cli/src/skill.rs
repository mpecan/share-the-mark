use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Result};

const SKILL: &str = include_str!("../skill/share-the-mark/SKILL.md");

/// Write the bundled skill to `<dir>/share-the-mark/SKILL.md`, defaulting to the
/// per-OS Claude skills directory (`~/.claude/skills`). Returns the written path.
pub fn install(dir: Option<PathBuf>) -> Result<PathBuf> {
    let base = match dir {
        Some(d) => d,
        None => default_skills_dir()?,
    };
    let target = base.join("share-the-mark");
    fs::create_dir_all(&target)?;
    let path = target.join("SKILL.md");
    fs::write(&path, SKILL)?;
    Ok(path)
}

fn default_skills_dir() -> Result<PathBuf> {
    let home = directories::BaseDirs::new()
        .ok_or_else(|| anyhow!("cannot determine home directory"))?
        .home_dir()
        .to_path_buf();
    Ok(home.join(".claude").join("skills"))
}
