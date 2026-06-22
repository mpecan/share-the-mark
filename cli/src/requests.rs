use std::path::PathBuf;

use crate::store::new_id;

// In-memory registry of "open requests" created by `share-the-mark request`: an agent opens
// a page for annotation and waits; when a brief of the same origin is sent, the
// matching request is fulfilled and the waiting client returns it. Requests are
// ephemeral (lost on daemon restart) — that's fine, the agent re-requests.

/// A local artifact the daemon serves for a request (Channel C, SPEC §13.6). Paths
/// are absolute — the CLI canonicalizes them before registering, so the daemon never
/// resolves anything against its own (possibly unrelated) working directory.
pub struct Artifact {
    pub dir: PathBuf,
    pub bundle: PathBuf,
}

pub struct OpenRequest {
    pub id: String,
    pub origin: String,
    pub created_at: i64,
    pub brief_id: Option<String>,
    pub artifact: Option<Artifact>,
}

#[derive(Default)]
pub struct Requests {
    items: Vec<OpenRequest>,
}

impl Requests {
    fn next_id(&self, now: i64) -> String {
        let id = new_id(now);
        if self.items.iter().any(|r| r.id == id) {
            format!("{id}{}", self.items.len())
        } else {
            id
        }
    }

    fn push(&mut self, origin: String, artifact: Option<Artifact>, now: i64) -> String {
        let id = self.next_id(now);
        self.items.push(OpenRequest {
            id: id.clone(),
            origin,
            created_at: now,
            brief_id: None,
            artifact,
        });
        id
    }

    pub fn create(&mut self, url: &str, now: i64) -> String {
        self.push(origin_of(url), None, now)
    }

    /// Register a request that serves a local artifact from `origin` (the daemon's
    /// own loopback origin). The brief will carry an `…/artifact/<id>/…` URL, so it's
    /// routed back by id (`fulfill_by_id`), not by the shared loopback origin.
    pub fn create_local(&mut self, origin: &str, artifact: Artifact, now: i64) -> String {
        self.push(origin.to_string(), Some(artifact), now)
    }

    /// Fulfill the exact request `id` if it's still open. Returns true if it was.
    /// Used for local artifacts, which all share the loopback origin and so can't be
    /// disambiguated by `fulfill`.
    pub fn fulfill_by_id(&mut self, id: &str, brief_id: &str) -> bool {
        match self
            .items
            .iter_mut()
            .find(|r| r.id == id && r.brief_id.is_none())
        {
            Some(request) => {
                request.brief_id = Some(brief_id.to_string());
                true
            }
            None => false,
        }
    }

    /// Fulfill the oldest unfulfilled request matching the brief's origin.
    /// Returns true if a request was fulfilled.
    pub fn fulfill(&mut self, brief_url: &str, brief_id: &str) -> bool {
        let origin = origin_of(brief_url);
        let candidate = self
            .items
            .iter_mut()
            .filter(|r| r.brief_id.is_none() && r.origin == origin)
            .min_by_key(|r| r.created_at);
        match candidate {
            Some(request) => {
                request.brief_id = Some(brief_id.to_string());
                true
            }
            None => false,
        }
    }

    pub fn get(&self, id: &str) -> Option<&OpenRequest> {
        self.items.iter().find(|r| r.id == id)
    }
}

/// The `scheme://host[:port]` origin of a URL (path/query stripped).
pub fn origin_of(url: &str) -> String {
    match url.split_once("://") {
        Some((scheme, rest)) => {
            let authority = rest.split('/').next().unwrap_or(rest);
            format!("{scheme}://{authority}")
        }
        None => url.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origins_drop_path_and_query() {
        assert_eq!(origin_of("https://x.test/a/b?c=1"), "https://x.test");
        assert_eq!(
            origin_of("http://localhost:3000/checkout"),
            "http://localhost:3000"
        );
        assert_eq!(origin_of("weird"), "weird");
    }

    #[test]
    fn fulfills_oldest_same_origin_request() {
        let mut requests = Requests::default();
        let a = requests.create("https://x.test/one", 10);
        let b = requests.create("https://x.test/two", 20);
        let other = requests.create("https://y.test/z", 30);

        // A same-origin brief fulfills the oldest matching request (a), not b/other.
        assert!(requests.fulfill("https://x.test/three", "brief1"));
        assert_eq!(
            requests.get(&a).unwrap().brief_id.as_deref(),
            Some("brief1")
        );
        assert_eq!(requests.get(&b).unwrap().brief_id, None);
        assert_eq!(requests.get(&other).unwrap().brief_id, None);

        // The next x.test brief fulfills b.
        assert!(requests.fulfill("https://x.test/four", "brief2"));
        assert_eq!(
            requests.get(&b).unwrap().brief_id.as_deref(),
            Some("brief2")
        );

        // No open x.test request left → not fulfilled.
        assert!(!requests.fulfill("https://x.test/five", "brief3"));
    }

    #[test]
    fn unknown_id_is_none() {
        let requests = Requests::default();
        assert!(requests.get("nope").is_none());
    }

    #[test]
    fn fulfills_local_request_by_id_not_origin() {
        let mut requests = Requests::default();
        let origin = "http://127.0.0.1:8787";
        let artifact = || Artifact {
            dir: PathBuf::from("/tmp/a"),
            bundle: PathBuf::from("/tmp/embed.js"),
        };
        // Two local artifacts share the loopback origin; only the id disambiguates.
        let a = requests.create_local(origin, artifact(), 10);
        let b = requests.create_local(origin, artifact(), 20);

        assert!(requests.fulfill_by_id(&b, "brief-b"));
        assert_eq!(requests.get(&a).unwrap().brief_id, None);
        assert_eq!(
            requests.get(&b).unwrap().brief_id.as_deref(),
            Some("brief-b")
        );

        // An unknown id fulfills nothing; a fulfilled request isn't re-fulfilled.
        assert!(!requests.fulfill_by_id("nope", "x"));
        assert!(!requests.fulfill_by_id(&b, "again"));
    }
}
