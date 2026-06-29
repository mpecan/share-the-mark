//! Canonical cross-discovery links (SPEC §11.2). The CLI and the browser
//! extension are useless apart, so the surfaces that hit a dead end (`serve`,
//! `request`, `setup`) point at the extension from here — one place to edit.
//! Mirrors the extension's `src/core/links.ts`. The extension is published to
//! both stores; `HUB_URL` stays the GitHub repo (project home / cross-browser
//! landing), `setup` lists the per-store links.

/// The project's home and cross-browser landing page (links to both stores).
pub const HUB_URL: &str = "https://github.com/mpecan/share-the-mark";

/// The extension on the Chrome Web Store (also serves Chromium-based browsers).
pub const CHROME_STORE_URL: &str =
    "https://chromewebstore.google.com/detail/share-the-mark/akliipgpjcaclhfmdbgcnfkliinnaiao";

/// The extension on Firefox Add-ons (locale-agnostic path; AMO localizes it).
pub const FIREFOX_STORE_URL: &str = "https://addons.mozilla.org/firefox/addon/share-the-mark/";

/// One-line pointer to the extension, printed by the daemon banners (terse: these
/// print on every `serve`/`start`, so they stay a single cross-browser line).
pub fn extension_hint() -> String {
    format!("Annotate pages with the extension: {HUB_URL}")
}

/// Store-direct install pointer for the moment a user needs the extension *now* —
/// the `request <url>` dead-end ("nothing showing up?"). Lists both published
/// stores so there's no extra hop through the repo to find the right one.
pub fn install_hint() -> String {
    format!(
        "Install the share-the-mark extension:\n  \
         Chrome / Chromium: {CHROME_STORE_URL}\n  Firefox: {FIREFOX_STORE_URL}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_hint_lists_both_published_stores() {
        let hint = install_hint();
        assert!(hint.contains(CHROME_STORE_URL));
        assert!(hint.contains(FIREFOX_STORE_URL));
    }
}
