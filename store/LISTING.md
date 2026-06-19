# Store listing copy — share the mark

Paste-ready copy for the Chrome Web Store, Firefox AMO, and Edge Add-ons
dashboards. Keep this in sync with `package.json` / `wxt.config.ts`.

## Name

share the mark

## Summary (≤132 chars, Chrome short description)

Annotate any web page and export a Markdown changelog plus an annotated
screenshot to your clipboard.

## Category

Developer Tools (Chrome/Edge) · "Other" or "Web Development" (Firefox)

## Detailed description

share the mark turns any live web page into a design-feedback canvas. Draw
callouts, notes, arrows, highlights, and element comments directly on the page,
then export everything as a clean Markdown changelog plus an annotated PNG — copied
straight to your clipboard, ready to paste into an issue, PR, or doc.

Annotations are anchored to the page's content (not fixed pixel coordinates), so
they survive scrolling, resizing, and re-renders. Each callout resolves to a CSS
selector for the element it points at, so the exported changelog tells you (or your
coding agent) exactly what to change. Because the marks are content-anchored, you
can also copy a share link and a teammate sees them redrawn on the live page — no
screenshot needed.

Features

- Five drawing tools: callout, text note, arrow, highlight, and element comment
- A select tool to move, edit, and re-anchor existing marks
- Markdown changelog export with resolved element selectors
- Annotated screenshot export (composited locally)
- Share a mark across machines: copy a link (no screenshot) that redraws the marks
  on the live page when a teammate opens it
- An in-page changelog panel you can collapse out of the way
- Optional: hand a brief to a local coding agent via the companion
  `share-the-mark` CLI (off by default; nothing leaves your machine)

Privacy
Everything stays on your device. No accounts, no servers, no telemetry. See the
privacy policy: https://github.com/mpecan/share-the-mark/blob/main/PRIVACY.md

## Privacy policy URL

https://github.com/mpecan/share-the-mark/blob/main/PRIVACY.md

## Permission justifications (Chrome Web Store / Edge review form)

- activeTab — inject the annotation overlay into the tab the user is actively
  annotating, only after they click the toolbar button. The extension requests NO
  host access at install (no "read and change all your data on all websites").
- scripting — inject the overlay/panel into the active page on activation.
- storage — persist the user's annotations (per tab/URL) and settings locally.
- host permission http://127.0.0.1/* (OPTIONAL) — not requested at install. Only requested at runtime if the user enables "Agent integration" in Options, to send a brief to a local companion daemon they run themselves on loopback. No remote hosts are ever contacted.
- host permission <all_urls> (OPTIONAL) — not requested at install. Only requested at runtime, for the single site, when the user opens a "shared mark" link, so the marks can be re-drawn on that page. The user is prompted per site and can decline.
- Remote code: none. All code is bundled in the package.

## Single purpose (Chrome)

Annotate web pages and export the annotations as Markdown plus a screenshot.

## Data usage disclosures (Chrome "Privacy practices")

- Does the extension collect or use data? Only locally; nothing is transmitted off
  the user's device.
- Sold to third parties? No.
- Used/transferred for purposes unrelated to core functionality? No.
- Used/transferred to determine creditworthiness or for lending? No.

## Firefox AMO notes

- Extension ID: share-the-mark@mpecan.dev (set via browser_specific_settings).
- Source code submission: upload `share-the-mark-<version>-sources.zip` (produced
  by `pnpm zip:firefox`). Build instructions below.
- Build instructions for reviewers:
  1. Install Node 22 and pnpm 10 (`corepack enable`).
  2. `pnpm install`
  3. `pnpm zip:firefox`
  4. Compare `.output/share-the-mark-<version>-firefox.zip` with the submitted
     add-on. (The `cli/` directory is the optional, separate Rust companion and is
     not part of the extension build.)

## Screenshots

Required: at least one. Recommended 1280×800 (Chrome) — also accepts 640×400.

Generated automatically into `store/screenshots/` by **`pnpm screenshots`** (after
`pnpm build`). It seeds a generic demo page (`tests/fixtures/demo.html`) with one
mark per tool via the real share-link import flow, then captures:

| File               | Shows                                                                                                     | Suggested caption                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `01-annotated.png` | A page under review with callouts, a note, an arrow, a highlight, an element box, and the changelog panel | "Mark up any page — five tools, anchored to the content."    |
| `02-markdown.png`  | The exported Markdown change-brief (real export output)                                                   | "Export a Markdown changelog with element selectors."        |
| `04-options.png`   | The Options page with the "Agent integration" toggle                                                      | "Everything stays on your device. Agent hand-off is opt-in." |

To restyle the shots, edit `tests/fixtures/demo.html` (the page) or the `PLAN`
array in `tests/e2e/screenshots.spec.ts` (the marks), then re-run `pnpm screenshots`.

Not auto-generated (the panel/overlay live in a closed shadow root, so toggling the
collapsed state can't be driven from outside): the optional collapsed-panel shot —
capture it by hand if you want a fourth image.
