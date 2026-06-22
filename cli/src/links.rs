//! Canonical cross-discovery links (SPEC §11.2). The CLI and the browser
//! extension are useless apart, so the surfaces that hit a dead end (`serve`,
//! `request`, `setup`) point at the extension from here — one place to edit.
//! Mirrors the extension's `src/core/links.ts`. Swap in a store URL once approved.

/// Where to get the browser extension (and the project's home).
pub const HUB_URL: &str = "https://github.com/mpecan/share-the-mark";
