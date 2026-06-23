# share-the-mark

A cross-browser (Chromium + Firefox) web extension for annotating live web pages
and exporting a structured Markdown changelog plus an annotated screenshot to the
clipboard — ready to paste into an AI assistant or a bug report.

Built on [WXT](https://wxt.dev) with React, TypeScript-first, open source under
the [MIT License](./LICENSE).

## What it does

Activate annotation mode on any page and mark it up with five focused tools —
**callout** (auto-numbered marker), **text**, **arrow**, **highlight** (a real
text-selection highlight), and **element** (select a whole element and comment
on it, for design feedback). Every annotation is **content-anchored** using the W3C Web Annotation model
(Hypothesis-style text selectors): a text-position offset plus a text-quote with
surrounding context, scoped to a verified-unique element selector. Resolution
falls back from position to a fuzzy quote match, so marks track the content as
the page scrolls, resizes, reflows, or re-renders — not just on resize.
A live changelog panel tracks every marker; you can switch tools, edit notes,
and delete markers (callouts renumber automatically).

On export, the extension composites the annotations onto a screenshot and writes
**both** a Markdown changelog (`text/plain`) and the annotated PNG (`image/png`)
to the clipboard as a single item. The Markdown is stable and agent-friendly:

```text
# Change brief — Example page
Source: https://example.com/page
Captured: 2026-06-17T00:00:00.000Z

1. Fix the heading copy
   Element: `#hero h1`
2. Remove this banner
   Element: `[data-testid="promo"]`
```

You can also **Copy share link** — a compact token of just the annotations (no
screenshot). Paste it to a teammate; when they open it, the extension reopens the
page and redraws the marks against the live content, so a review travels across
machines without a screenshot ever leaving anyone's device.

## Status

**Shipped:** the annotation core (five drawing tools plus a select tool,
content-anchored selectors, the in-page changelog panel, screenshot capture +
compositing, clipboard export, per-tab/URL persistence, options page); **agent
integration** through the local `share-the-mark` CLI/daemon (below); and
**cross-machine sharing** via copy-paste share links. The content script is
**injected on demand under `activeTab`**, so the install requests no host access.
Deferred: a `FileSystemSink`, a native side panel, and Firefox e2e — see `SPEC.md`.

## Install (from source)

Prerequisites: **Node 22** (pinned in `.tool-versions`) and **pnpm**.

```bash
pnpm install
pnpm dev            # Chrome, with hot reload
pnpm dev:firefox    # Firefox, with hot reload
```

Or load a production build unpacked:

```bash
pnpm build          # outputs .output/chrome-mv3
pnpm build:firefox  # outputs .output/firefox-mv2
```

- **Chrome:** `chrome://extensions` → enable Developer mode → **Load unpacked** →
  select `.output/chrome-mv3`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary
  Add-on** → select `.output/firefox-mv2/manifest.json`.

The overlay is injected only when you click the toolbar button (no broad host
access), so there's nothing to reload — just open a tab and **Start annotating**.

## Usage

1. Open a normal http(s) page and click the extension icon → **Start
   annotating**. The changelog panel appears on the right.
2. Pick a tool from the palette and mark up the page: click to drop a **callout**
   or place **text** (it prompts for content), drag for an **arrow**, select text
   with the **highlight** tool, or use **element** to hover-and-click a whole
   element and comment on it.
3. Switch to the **Select** tool (the cursor, first in the palette) to edit:
   handles appear on marks and the cursor changes. Drag a callout or text label
   to reposition it, drag an arrow's endpoint handles (or its line) to retarget
   it, drag a highlight's start/end handles to extend or shrink it, and
   double-click a text label to retype it. Dropping a callout, text label, or
   arrow head over new text re-anchors it there.
4. Add notes/comments in the panel; delete markers with ✕.
5. Click **Copy to clipboard** and paste the Markdown + screenshot anywhere,
   **Copy share link** to hand the marks to a teammate on another machine, or
   **Send to agent** to hand the brief to the local `share-the-mark` daemon (see below).

## Connect a coding agent (the `share-the-mark` CLI)

`share-the-mark` is a small cross-platform (macOS/Linux/Windows) Rust CLI under [`cli/`](cli)
that receives change-briefs from the extension and exposes them to a coding agent.

**Install** (pick one):

```bash
# Prebuilt binary via curl | sh (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/mpecan/share-the-mark/main/install.sh | sh

# Prebuilt binary via cargo-binstall (all platforms)
cargo binstall share-the-mark

# Homebrew (macOS/Linux)
brew install mpecan/tools/share-the-mark

# From source (needs a Rust toolchain + Node, for the embedded annotation UI)
mise run cli:install        # builds the embed bundle, then `cargo install --path cli`
```

> Installing from source with a bare `cargo install --path cli` skips the embed-bundle
> build, so the local-serve UI (`request <path>`) would be empty. Use `mise run cli:install`
> (above), or run `pnpm build:embed` first. Prebuilt binaries / crates.io / Homebrew all
> bundle the UI already.

You can also download a binary for your platform from the
[Releases](https://github.com/mpecan/share-the-mark/releases) page. Then:

```bash
share-the-mark setup          # install the skill, open the extension page, report daemon status
share-the-mark start          # launch the ingest daemon in the background (use `serve` to run it in the foreground)
share-the-mark skill install  # install the Claude Code skill into ~/.claude/skills
```

The extension and the CLI are two halves of one tool — neither does anything alone.
`share-the-mark setup` is the fastest way to wire up the agent side: it installs the
Claude Code skill and points you at the [extension](https://github.com/mpecan/share-the-mark).
The extension's Options page returns the favor with copy-paste CLI install commands.

Then, in the extension panel, click **Send to agent**. The daemon stores the brief
(`brief.md` + annotated `screenshot.png`) and the panel shows a handoff token:

```
✓ sent — paste to your agent: share-the-mark show ab12
```

Paste that to your agent (or just ask it about your marks — the installed skill
teaches it to run `share-the-mark pending` / `share-the-mark show <id>`). The agent reads the Markdown
(element selectors + your comments) and the screenshot, and acts on the feedback.

**Agent-initiated requests.** An agent can also ask _you_ for feedback:
`share-the-mark request <url>` opens the page in your browser and blocks until you annotate
it and click **Send to agent**, then returns the brief — which wakes a
backgrounded agent (e.g. Claude Code) so it can act on your comments.

**Annotate a remote URL without the extension (`--playwright`).** Add `--playwright`
to a URL request and the CLI drives a headed [Playwright](https://playwright.dev)
browser it controls, injecting the panel directly (Channel A — CSP-immune, no extension):

```bash
share-the-mark request --playwright https://example.com   # opens a browser you annotate in
```

Annotate the page it opens and click **Send to agent**; the brief flows back exactly as
above (close the window to cancel). This needs Node and Playwright available — it's
resolved from your project's `node_modules`, the current directory, or a global install
(`npm i -g playwright && playwright install chromium`), never bundled into the binary.
For local files, use the plain `request <path>` (below) instead.

**Annotate a local artifact (no extension).** Point `request` at a local HTML file or
directory and the daemon serves it on its loopback origin with the annotation panel
already injected — no extension needed (SPEC §13.6):

```bash
share-the-mark request ./preview.html     # serves + opens it, blocks for your feedback
```

Draw on the page and click **Send to agent**; the brief posts straight back to
the daemon and the command returns it. Ideal for an agent that just generated an HTML
artifact and wants your design feedback on it. The injected bundle is **baked into the
binary** — an installed `share-the-mark` is self-contained. Building from this repo,
use `mise run cli:build` (it builds the bundle first); override the served bundle for
dev with `--bundle <path>` or `SHARE_THE_MARK_EMBED_BUNDLE`.

CLI: `share-the-mark setup | request [--playwright] <url-or-path> | pending | list | show <id> | serve | start | stop | status | skill install`.
Config via flags or `SHARE_THE_MARK_PORT` / `SHARE_THE_MARK_DIR`.

**Daemon lifecycle.** `share-the-mark start` (background) and `share-the-mark serve` (foreground, the
process `start` spawns) run until you `share-the-mark stop` them.
A daemon that `share-the-mark request` auto-starts gets an idle timeout (default 30 min,
`--idle-timeout` / `SHARE_THE_MARK_IDLE`) and shuts itself down once unused — so it never
lingers as a stray. `share-the-mark status` checks if one is running.

## Embed it without the extension (dev/staging widget)

The annotation UI ships as a self-contained `<script>` you can drop into your own
dev/staging build — no extension install — to collect design feedback (SPEC §13.5).
Build the bundle (`pnpm build:embed` → `.output/embed/share-the-mark.global.js`), host
it, and:

```html
<script src="https://your-cdn.example/share-the-mark.global.js"></script>
<script>
  // Gate it so it never ships to production.
  if (import.meta.env?.DEV) {
    ShareTheMark.init({
      // Receive the annotation Markdown + composited PNG. Omit to copy Markdown to the clipboard.
      onSubmit: (payload) => sendToYourBacklog(payload.markdown),
    });
  }
</script>
```

`init(config)` returns a handle: `stm.open()`, `stm.close()`, `stm.destroy()`,
`stm.exportNow()`. The widget renders into an isolated **shadow root**, captures the
page itself via a bundled default (`html-to-image`, overridable with
`config.screenshot`), and makes **no network calls** of its own — `onSubmit` is where
_you_ send the feedback. A runnable example lives in [`demo/index.html`](./demo/index.html).

**Content-Security-Policy** the _host_ page needs (only the first is for the library):

- `script-src` — allow the bundle's origin (e.g. `script-src 'self' https://your-cdn.example`).
- `img-src data:` — the panel preview and composited export use `data:` PNG URLs.
- `connect-src` — only for _your_ `onSubmit` destination; the library needs none.
- The panel's styles are injected into the shadow root and are generally exempt from
  the page's `style-src`; add `'unsafe-inline'` only if a strict policy flags them.

Cross-origin images on the page may taint the capture canvas (a `foreignObject`
limitation); first-party dev pages are typically unaffected.

## Permissions

Least-privilege (Manifest V3): `activeTab`, `scripting`, `storage`, and **no
`host_permissions`** — so the install requests no broad site access (no "read and
change all your data on all websites"). The overlay is injected on demand under
`activeTab`; `tabs.captureVisibleTab` works the same way. Two host patterns are
declared **optional** (requested at runtime, never at install): `http://127.0.0.1/*`
for **Send to agent** (the local daemon), and `<all_urls>`, requested **per site**
only when you open a shared mark so the marks can be redrawn there.

## Development

`SPEC.md` is the full build brief and the source of truth; `CLAUDE.md` is the
short operating layer on top of it.

Tasks are wired through [`mise`](https://mise.jdx.dev) (`mise tasks` to list,
`mise run <task>`); each maps to the underlying `pnpm`/`cargo` command, so you can
use either:

```bash
mise run dev            # load the extension in Chrome (hot-reload)
mise run dev:firefox    # load the extension in Firefox (hot-reload)
mise run cli:install     # put the `share-the-mark` binary on PATH
mise run serve           # run the share-the-mark ingest daemon
mise run request <url>   # agent flow: open a page, wait for feedback

mise run check           # all extension gates (typecheck, lint, test, builds, e2e, size)
mise run cli:check       # all CLI gates (fmt, clippy, test)
mise run check:all       # both
```

The equivalent raw commands (`pnpm typecheck | lint | test | e2e | size`,
`cargo …` in `cli/`) still work directly.

### Local review flow (extension ↔ agent)

1. `mise run dev:firefox` (or `dev`) — loads the extension into the browser.
2. `mise run cli:install` then `share-the-mark serve` (or `mise run serve`) — runs the daemon.
3. The agent runs `share-the-mark request <url>` (or you click **Send to agent** in the
   panel); annotate the page, click **Send to agent**, and the brief flows to the
   agent.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full quality bar, architecture
invariants, and the contribution workflow.

## License

[MIT](./LICENSE) © 2026 Matjaz Domen Pecan. Contributions are accepted under the
same license.
