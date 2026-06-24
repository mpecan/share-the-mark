---
title: Permissions & privacy
description: Least-privilege Manifest V3 — activeTab, scripting, storage, and no broad host access at install.
sidebar:
  order: 6
---

Least-privilege (Manifest V3): `activeTab`, `scripting`, `storage`, and **no
`host_permissions`** — so the install requests no broad site access (no "read and
change all your data on all websites").

The overlay is injected on demand under `activeTab`; `tabs.captureVisibleTab` works
the same way. Two host patterns are declared **optional** (requested at runtime,
never at install):

- `http://127.0.0.1/*` — for **Send to agent** (the local daemon). Off by default;
  nothing leaves your machine until you enable it on the Options page.
- `<all_urls>` — requested **per site** only when you open a shared mark, so the
  marks can be redrawn there.

Everything stays on your device: the extension makes no network calls of its own,
and **Send to agent** talks only to `127.0.0.1`. See
[PRIVACY.md](https://github.com/mpecan/share-the-mark/blob/main/PRIVACY.md) for the
full statement.
