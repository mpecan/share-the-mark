// Canonical cross-discovery links (SPEC §11.2). The extension and the
// `share-the-mark` CLI are useless apart, so every surface that hits a dead end
// (no daemon, no extension) points at the *other* half from here — one place to
// edit. Pure data, browser-free, so it lives under the 100%-covered core.
//
// The hub is the GitHub repo for now; swap in the Chrome/Firefox store URLs here
// once they're approved. The Rust side mirrors this in `cli/src/links.rs`.

/** Where to get the browser extension (and the project's home). */
export const HUB_URL = 'https://github.com/mpecan/share-the-mark';

/** The loopback address the `share-the-mark` daemon listens on (SPEC §5.4). The
 * single source of truth for host:port — the agent-setup view shows it verbatim and
 * the background SW builds its fetch base (`DAEMON_BASE`) from it. */
export const DAEMON_ADDRESS = '127.0.0.1:8787';

/** The one-liner the agent-setup view tells the user to run once the CLI is
 * installed (mirrors the Options page copy). */
export const DAEMON_SERVE_COMMAND = 'share-the-mark serve';

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
