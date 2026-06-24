---
title: Embed without the extension
description: Drop the @share-the-mark/embed widget into a dev/staging build to collect design feedback — no extension install required.
sidebar:
  order: 5
---

The annotation UI ships as a self-contained widget you can drop into your own
dev/staging build — no extension install — to collect design feedback (SPEC §13.5).
It's published to npm as [`@share-the-mark/embed`](https://www.npmjs.com/package/@share-the-mark/embed)
and renders into an isolated **shadow root**, so it won't collide with the host
page.

## Install from npm

```bash
npm install @share-the-mark/embed
```

```ts
import { init } from '@share-the-mark/embed';

// Gate it so it never ships to production.
if (import.meta.env?.DEV) {
  init({
    // Receive the annotation Markdown + composited PNG. Omit to copy Markdown to the clipboard.
    onSubmit: (payload) => sendToYourBacklog(payload.markdown),
  });
}
```

## Or via `<script>` / CDN

The prebuilt bundles are shipped in the package (served by unpkg):

```html
<script src="https://unpkg.com/@share-the-mark/embed/dist/share-the-mark.global.js"></script>
<script>
  ShareTheMark.init({ onSubmit: (payload) => sendToYourBacklog(payload.markdown) });
</script>
```

A runnable example lives in
[`demo/index.html`](https://github.com/mpecan/share-the-mark/blob/main/demo/index.html).

## The handle

`init(config)` returns a handle: `stm.open()`, `stm.close()`, `stm.destroy()`,
`stm.exportNow()`. The widget captures the page itself via a bundled default
(`html-to-image`, overridable with `config.screenshot`) and makes **no network
calls** of its own — `onSubmit` is where _you_ send the feedback.

## Content-Security-Policy

What the _host_ page needs (only the first is for the library):

- `script-src` — allow the bundle's origin (e.g. `script-src 'self' https://unpkg.com`).
- `img-src data:` — the panel preview and composited export use `data:` PNG URLs.
- `connect-src` — only for _your_ `onSubmit` destination; the library needs none.
- The panel's styles are injected into the shadow root and are generally exempt
  from the page's `style-src`; add `'unsafe-inline'` only if a strict policy flags
  them.

Cross-origin images on the page may taint the capture canvas (a `foreignObject`
limitation); first-party dev pages are typically unaffected.

:::tip[Prefer no `<script>` at all?]
The CLI can drive a Playwright browser (`share-the-mark request --playwright <url>`)
or serve a local artifact (`share-the-mark request <path>`) with the panel injected
— see [Connect a coding agent](./agent-integration/).
:::
