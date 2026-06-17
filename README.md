# share-the-mark

A cross-browser (Chromium + Firefox) web extension for annotating live web pages
and exporting a structured Markdown changelog plus an annotated screenshot to the
clipboard — ready to paste into an AI assistant or a bug report.

Built on [WXT](https://wxt.dev) with React, TypeScript-first, open source under
the [MIT License](./LICENSE).

## What it does

Activate annotation mode on any page and mark it up with four focused tools —
**callout** (auto-numbered marker), **text**, **arrow**, and **highlight** (a
real text-selection highlight). Every annotation is **content-anchored**: it
attaches to a real element via a robust, verified-unique CSS selector and stores
its position relative to that element (or, for highlights, a character range in
the text), so marks track the content as the page scrolls, resizes, or reflows.
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
   or place **text** (it prompts for content), drag for an **arrow**, or select
   text with the **highlight** tool to highlight it.
3. Add notes in the panel; delete markers with ✕.
4. Click **Copy to clipboard** and paste the Markdown + screenshot anywhere.

## Permissions

Least-privilege (Manifest V3): `activeTab`, `scripting`, `storage`. No host
permissions — `tabs.captureVisibleTab` works under `activeTab` + a user gesture.

## Development

`SPEC.md` is the full build brief and the source of truth; `CLAUDE.md` is the
short operating layer on top of it. Common commands:

```bash
pnpm typecheck      # tsc --noEmit (strict)
pnpm lint           # eslint, zero warnings
pnpm test           # vitest with coverage thresholds
pnpm e2e            # Playwright against the built extension (run pnpm build first)
pnpm size           # gzip bundle budget
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full quality bar, architecture
invariants, and the contribution workflow.

## License

[MIT](./LICENSE) © 2026 Matjaz Domen Pecan. Contributions are accepted under the
same license.
