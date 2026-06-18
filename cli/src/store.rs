use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// Per-brief metadata, persisted alongside the Markdown and screenshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meta {
    pub id: String,
    pub url: String,
    pub title: String,
    /// When the page was captured (ms epoch), from the extension.
    pub captured_at: i64,
    /// When the daemon received the brief (ms epoch).
    pub received_at: i64,
    pub read: bool,
}

/// A brief resolved from disk: its metadata, Markdown body, and screenshot path.
pub struct Brief {
    pub meta: Meta,
    pub markdown: String,
    pub screenshot: PathBuf,
}

/// On-disk store: `<root>/briefs/<id>/{brief.md, screenshot.png, meta.json}`.
pub struct Store {
    root: PathBuf,
}

impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    fn briefs_dir(&self) -> PathBuf {
        self.root.join("briefs")
    }

    fn dir_for(&self, id: &str) -> PathBuf {
        self.briefs_dir().join(id)
    }

    /// Persist a brief. `png` is the already-decoded screenshot bytes.
    pub fn save(&self, markdown: &str, png: &[u8], meta: &Meta) -> Result<()> {
        let dir = self.dir_for(&meta.id);
        fs::create_dir_all(&dir).with_context(|| format!("creating {}", dir.display()))?;
        fs::write(dir.join("brief.md"), markdown)?;
        fs::write(dir.join("screenshot.png"), png)?;
        fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(meta)?)?;
        Ok(())
    }

    fn read_meta(&self, dir: &Path) -> Result<Meta> {
        let raw = fs::read(dir.join("meta.json"))?;
        Ok(serde_json::from_slice(&raw)?)
    }

    /// All briefs, newest first.
    pub fn list(&self) -> Result<Vec<Meta>> {
        let dir = self.briefs_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut metas = Vec::new();
        for entry in fs::read_dir(&dir)? {
            let path = entry?.path();
            if path.join("meta.json").exists() {
                metas.push(self.read_meta(&path)?);
            }
        }
        metas.sort_by_key(|m| std::cmp::Reverse(m.received_at));
        Ok(metas)
    }

    /// Briefs not yet marked read, newest first.
    pub fn pending(&self) -> Result<Vec<Meta>> {
        Ok(self.list()?.into_iter().filter(|m| !m.read).collect())
    }

    pub fn get(&self, id: &str) -> Result<Option<Brief>> {
        let dir = self.dir_for(id);
        if !dir.join("meta.json").exists() {
            return Ok(None);
        }
        let meta = self.read_meta(&dir)?;
        let markdown = fs::read_to_string(dir.join("brief.md"))?;
        Ok(Some(Brief {
            meta,
            markdown,
            screenshot: dir.join("screenshot.png"),
        }))
    }

    /// Mark a brief read. Returns false if the id is unknown.
    pub fn mark_read(&self, id: &str) -> Result<bool> {
        let dir = self.dir_for(id);
        if !dir.join("meta.json").exists() {
            return Ok(false);
        }
        let mut meta = self.read_meta(&dir)?;
        meta.read = true;
        fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
        Ok(true)
    }
}

/// Current time in milliseconds since the Unix epoch.
pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A short, time-ordered id (base36 of the millisecond clock).
pub fn new_id(now: i64) -> String {
    to_base36(now as u64)
}

fn to_base36(mut n: u64) -> String {
    const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".to_string();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(ALPHABET[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).expect("base36 is ascii")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn meta(id: &str, read: bool, received_at: i64) -> Meta {
        Meta {
            id: id.to_string(),
            url: "https://example.com/page".to_string(),
            title: "Example".to_string(),
            captured_at: 1000,
            received_at,
            read,
        }
    }

    #[test]
    fn saves_and_gets_a_brief() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store
            .save("# Brief", b"PNGDATA", &meta("ab12", false, 10))
            .unwrap();

        let brief = store.get("ab12").unwrap().expect("brief exists");
        assert_eq!(brief.markdown, "# Brief");
        assert_eq!(brief.meta.url, "https://example.com/page");
        assert_eq!(std::fs::read(&brief.screenshot).unwrap(), b"PNGDATA");
        assert!(store.get("missing").unwrap().is_none());
    }

    #[test]
    fn lists_newest_first_and_filters_pending() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store.save("a", b"x", &meta("a", false, 10)).unwrap();
        store.save("b", b"x", &meta("b", true, 20)).unwrap();
        store.save("c", b"x", &meta("c", false, 30)).unwrap();

        let ids: Vec<_> = store.list().unwrap().into_iter().map(|m| m.id).collect();
        assert_eq!(ids, ["c", "b", "a"]); // newest received_at first

        let pending: Vec<_> = store.pending().unwrap().into_iter().map(|m| m.id).collect();
        assert_eq!(pending, ["c", "a"]); // 'b' was read
    }

    #[test]
    fn marks_read() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store.save("a", b"x", &meta("a", false, 10)).unwrap();

        assert!(store.mark_read("a").unwrap());
        assert!(store.get("a").unwrap().unwrap().meta.read);
        assert!(store.pending().unwrap().is_empty());
        assert!(!store.mark_read("nope").unwrap());
    }

    #[test]
    fn lists_empty_when_no_store() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().join("nope"));
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn base36_ids_are_time_ordered() {
        assert!(new_id(1) < new_id(2));
        assert_eq!(to_base36(0), "0");
        assert_eq!(to_base36(35), "z");
        assert_eq!(to_base36(36), "10");
    }
}
