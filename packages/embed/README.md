# @share-the-mark/embed

The embeddable, browser-free annotation widget from
[share-the-mark](https://github.com/mpecan/share-the-mark) (SPEC §13) — annotate a
live page and export a Markdown changelog plus an annotated **full-page** screenshot,
**no browser extension required**.

It's the same engine as the extension, packaged for direct embedding: a self-contained
bundle (React, `html-to-image`, and the panel styles are all inlined and isolated in a
shadow root, so it won't collide with the host page).

## Install

```sh
npm install @share-the-mark/embed
```

## Use it as a library (Channel B)

```ts
import { init } from '@share-the-mark/embed';

const widget = init({
  // Receive the export (Markdown changelog + composited PNG). Defaults to copying
  // the Markdown to the clipboard if omitted.
  onSubmit: async ({ markdown, image }) => {
    // send to your backend / agent / clipboard …
  },
});

// widget.open() / widget.close() / widget.destroy() / widget.exportNow()
```

For full control there's also `mount(adapters)` (inject your own storage / screenshot /
export sinks) and `createAnnotationSession(adapters)` — see the exported types
(`MountOptions`, `WidgetConfig`, `HostAdapters`, `ExportPayload`, …).

Screenshots are captured **full-page** by default via `capturePage` (a DOM re-render):
the agent sees the whole scrollable page. Because it re-renders rather than taking a
true raster, cross-origin images/iframes, `<canvas>`/`<video>`, and some styling may be
missing — pass your own `screenshot` provider to override.

## Use it via `<script>` / CDN

The prebuilt IIFE bundles are shipped in the package and served by unpkg:

```html
<script src="https://unpkg.com/@share-the-mark/embed/dist/share-the-mark.global.js"></script>
<script>
  ShareTheMark.init({
    onSubmit: (payload) => {
      /* … */
    },
  });
</script>
```

- `share-the-mark.global.js` — the `<script>` widget (`window.ShareTheMark.init`).
- `local.global.js` — self-mounting build for the local-serve flow.
- `embed.global.js` — the Playwright-injection build (Channel A), injected via
  `addInitScript`; the Node-side `attach()` driver is not part of the typed npm
  surface — drive it with this bundle directly.

## License

MIT
