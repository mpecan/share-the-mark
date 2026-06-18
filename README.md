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

## Status

**Milestone 1 (annotation core) is complete:** all seven tools, the selector
engine, the in-page changelog panel, screenshot capture + compositing, clipboard
export, per-tab/URL persistence, and an options page. Milestone 2 (filesystem and
native-host export sinks, a native side panel, Firefox e2e) is planned and
additive — see `SPEC.md`.

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

Content scripts inject on page load, so reload any already-open tab after
installing.

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
5. Click **Copy to clipboard** and paste the Markdown + screenshot anywhere, or
   **Send to agent** to hand the brief to the local `stm` daemon (see below).

## Connect a coding agent (the `stm` CLI)

`stm` is a small cross-platform (macOS/Linux/Windows) Rust CLI under [`cli/`](cli)
that receives change-briefs from the extension and exposes them to a coding agent.

```bash
cargo install --path cli      # build & install the `stm` binary
stm serve                     # run the ingest daemon (or `stm start` to background it)
stm skill install             # install the Claude Code skill into ~/.claude/skills
```

Then, in the extension panel, click **Send to agent**. The daemon stores the brief
(`brief.md` + annotated `screenshot.png`) and the panel shows a handoff token:

```
✓ sent — paste to your agent: stm show ab12
```

Paste that to your agent (or just ask it about your marks — the installed skill
teaches it to run `stm pending` / `stm show <id>`). The agent reads the Markdown
(element selectors + your comments) and the screenshot, and acts on the feedback.

**Agent-initiated requests.** An agent can also ask _you_ for feedback:
`stm request <url>` opens the page in your browser and blocks until you annotate
it and click **Send to agent**, then returns the brief — which wakes a
backgrounded agent (e.g. Claude Code) so it can act on your comments.

CLI: `stm request <url> | pending | list | show <id> | serve | start | stop | status | skill install`.
Config via flags or `STM_PORT` / `STM_DIR`.

## Permissions

Least-privilege (Manifest V3): `activeTab`, `scripting`, `storage`, plus a single
loopback `host_permission` (`http://127.0.0.1/*`) so the **Send to agent** sink can
reach the local `stm` daemon. No web-origin host permissions —
`tabs.captureVisibleTab` works under `activeTab` + a user gesture.

## Development

`SPEC.md` is the full build brief and the source of truth; `CLAUDE.md` is the
short operating layer on top of it.

Tasks are wired through [`mise`](https://mise.jdx.dev) (`mise tasks` to list,
`mise run <task>`); each maps to the underlying `pnpm`/`cargo` command, so you can
use either:

```bash
mise run dev            # load the extension in Chrome (hot-reload)
mise run dev:firefox    # load the extension in Firefox (hot-reload)
mise run cli:install     # put the `stm` binary on PATH
mise run serve           # run the stm ingest daemon
mise run request <url>   # agent flow: open a page, wait for feedback

mise run check           # all extension gates (typecheck, lint, test, builds, e2e, size)
mise run cli:check       # all CLI gates (fmt, clippy, test)
mise run check:all       # both
```

The equivalent raw commands (`pnpm typecheck | lint | test | e2e | size`,
`cargo …` in `cli/`) still work directly.

### Local review flow (extension ↔ agent)

1. `mise run dev:firefox` (or `dev`) — loads the extension into the browser.
2. `mise run cli:install` then `stm serve` (or `mise run serve`) — runs the daemon.
3. The agent runs `stm request <url>` (or you click **Send to agent** in the
   panel); annotate the page, click **Send to agent**, and the brief flows to the
   agent.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full quality bar, architecture
invariants, and the contribution workflow.

## License

[MIT](./LICENSE) © 2026 Matjaz Domen Pecan. Contributions are accepted under the
same license.
