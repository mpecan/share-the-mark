//! The embed artifacts, baked in at compile time by `build.rs`. Empty when the binary
//! is built without them present (the placeholder fallback) — the daemon still starts
//! and the relevant feature degrades until rebuilt with `mise run build:embed`.

/// The Channel-C bundle (`local.global.js`) the daemon injects into served artifacts.
pub const EMBED_BUNDLE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/local.global.js"));

/// The Channel-A Node runner (`playwright-runner.mjs`) for `request --playwright`:
/// a headed, interactive Playwright session, written to a temp file and run with
/// `node`. Empty in a placeholder build (the flow errors with guidance).
pub const PLAYWRIGHT_RUNNER: &[u8] =
    include_bytes!(concat!(env!("OUT_DIR"), "/playwright-runner.mjs"));
