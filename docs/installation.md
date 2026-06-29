---
title: Install the extension
description: Install share-the-mark from the Chrome Web Store or Firefox Add-ons, or run it from source.
sidebar:
  order: 2
---

Install from your browser's store — one click, auto-updating:

- **Chrome / Chromium:** [Chrome Web Store](https://chromewebstore.google.com/detail/share-the-mark/akliipgpjcaclhfmdbgcnfkliinnaiao)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/share-the-mark/)

The overlay is injected only when you click the toolbar button (no broad host
access), so just open a tab and **Start annotating**.

## Run from source

Prefer to build it yourself, or want hot reload for development? Prerequisites:
**Node 22** (pinned in `.tool-versions`) and **pnpm**.

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
- **Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on**
  → select `.output/firefox-mv2/manifest.json`.
