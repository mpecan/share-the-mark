---
title: Install the extension
description: Run share-the-mark from source in Chrome or Firefox with hot reload, or load a production build unpacked.
sidebar:
  order: 2
---

Until the store listings land, install from source. Prerequisites: **Node 22**
(pinned in `.tool-versions`) and **pnpm**.

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

The overlay is injected only when you click the toolbar button (no broad host
access), so there's nothing to reload — just open a tab and **Start annotating**.
