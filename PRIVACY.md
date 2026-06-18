# Privacy Policy — share the mark

_Last updated: 2026-06-18_

**share the mark** is a browser extension for annotating web pages and exporting a
Markdown changelog plus an annotated screenshot. It is built to keep everything on
your machine.

## What the extension does with your data

- **Annotations and screenshots** you create are held in the browser's local
  extension storage (`storage.local`) for the current tab/URL, and are written to
  your **clipboard** when you choose "Copy to clipboard". They are never sent to us
  or to any remote server.
- **Page capture** (`tabs.captureVisibleTab`) runs only when you actively export,
  under a user gesture, to produce the annotated screenshot. The image stays local.
- **Settings** (default tool, colors, Markdown options) are stored in local
  extension storage.

## What we collect

**Nothing.** The extension has **no analytics, no telemetry, and no remote
servers.** No personal data, browsing history, or page content is transmitted to
the developer or any third party.

## Optional local agent integration

The extension can optionally send a brief to a **local** companion daemon
(`share-the-mark`) that you install and run yourself, reachable only at
`http://127.0.0.1` (your own computer). This is **off by default**: the
`127.0.0.1` host permission is optional and is requested only when you enable
"Agent integration" on the extension's Options page. When enabled, briefs are sent
to that loopback address on your machine and never leave your computer. Disabling
the toggle revokes the permission.

## Permissions and why they are needed

- `activeTab` + `scripting` — inject the annotation overlay into the page you are
  actively annotating.
- `storage` — persist your annotations and settings locally.
- `127.0.0.1/*` (optional) — talk to the local agent daemon, only if you enable it.

## Contact

Questions: open an issue at https://github.com/mpecan/share-the-mark or email
matjaz.pecan@gmail.com.
