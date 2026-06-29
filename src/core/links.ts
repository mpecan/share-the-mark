// Canonical cross-discovery links (SPEC §11.2). The extension and the
// `share-the-mark` CLI are useless apart, so every surface that hits a dead end
// (no daemon, no extension) points at the *other* half from here — one place to
// edit. Pure data, browser-free, so it lives under the 100%-covered core.
//
// The extension is published to both stores (`CHROME_STORE_URL` /
// `FIREFOX_STORE_URL`); `HUB_URL` stays the GitHub repo as the project's home and
// cross-browser landing page. The Rust side mirrors this in `cli/src/links.rs`.

/** The project's home and cross-browser landing page (links to both stores). */
export const HUB_URL = 'https://github.com/mpecan/share-the-mark';

/** The extension on the Chrome Web Store (also serves Chromium-based browsers). */
export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/share-the-mark/akliipgpjcaclhfmdbgcnfkliinnaiao';

/** The extension on Firefox Add-ons (locale-agnostic path; AMO localizes it). */
export const FIREFOX_STORE_URL = 'https://addons.mozilla.org/firefox/addon/share-the-mark/';

/** Per-store "get the extension" links, surfaced on the Options page. */
export const STORE_LINKS: readonly { label: string; url: string }[] = [
  { label: 'Chrome / Chromium', url: CHROME_STORE_URL },
  { label: 'Firefox', url: FIREFOX_STORE_URL },
];

/** The loopback address the `share-the-mark` daemon listens on (SPEC §5.4). The
 * single source of truth for host:port — the agent-setup view shows it verbatim and
 * the background SW builds its fetch base (`DAEMON_BASE`) from it. */
export const DAEMON_ADDRESS = '127.0.0.1:8787';

/** The one-liner the agent-setup view tells the user to run once the CLI is
 * installed (mirrors the Options page copy). `start` launches the daemon in the
 * background and returns immediately — the right fit for "run this, then it
 * connects". (`serve` is the blocking foreground variant `start` spawns; it's for
 * debugging / process managers, not this flow.) */
export const DAEMON_START_COMMAND = 'share-the-mark start';

/** Copy-paste ways to install the `share-the-mark` CLI/daemon, shown on the
 * Options page. Mirrors the README's install block. */
export const CLI_INSTALL: readonly { label: string; command: string }[] = [
  { label: 'Homebrew', command: 'brew install mpecan/tools/share-the-mark' },
  { label: 'cargo-binstall', command: 'cargo binstall share-the-mark' },
  {
    label: 'curl | sh',
    command:
      'curl -fsSL https://raw.githubusercontent.com/mpecan/share-the-mark/main/install.sh | sh',
  },
];
