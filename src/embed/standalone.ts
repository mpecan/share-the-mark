/* eslint-disable unicorn/prefer-global-this -- this script runs injected in the
   page; `window` is the page global the Playwright bindings + the handle live on. */
import { mount, AGENT_CAPABILITIES, type StmHandle } from './mount';
import { blobToBase64 } from './base64';
import type { ExportPayload } from '@/src/core/export';
import type { CapturedScreenshot } from '@/src/capture/composite';

// The standalone IIFE entry (SPEC §13.4), bundled by scripts/build-embed.mjs and
// injected via Playwright `addInitScript` (channel A) — and later a `<script>` tag
// (channel B). It wires the embed's two host seams to the Node side of the channel:
// a `__stmScreenshot` binding (page → driver `page.screenshot()`) and a
// `__stmDeliver` binding (driver receives the export). `exposeBinding` marshals only
// JSON, so the screenshot crosses as base64 and the export image is base64'd here
// before crossing. Excluded from coverage (browser/binding glue, like
// src/capture/composite-surface.ts); exercised by the e2e spec.

// The panel CSS, inlined at build time (esbuild `define`) — the embed has no WXT
// `cssInjectionMode`, so we hand the text to `mount()` to inject into the shadow root.
declare const __STM_PANEL_CSS__: string;

declare global {
  interface Window {
    /** The mounted embed handle, published for the driver to call `exportNow()`. */
    __stm?: StmHandle;
    /** Node binding: returns a base64 PNG of the page (`page.screenshot()`). */
    __stmScreenshot?: () => Promise<string>;
    /** Node binding: receives the export (Markdown + base64 PNG). */
    __stmDeliver?: (markdown: string, imageBase64: string) => Promise<void>;
  }
}

async function captureScreenshot(): Promise<CapturedScreenshot> {
  if (!window.__stmScreenshot) throw new Error('share-the-mark: no screenshot binding');
  const dataUrl = `data:image/png;base64,${await window.__stmScreenshot()}`;
  // The Node binding takes a FULL-PAGE `page.screenshot({ fullPage: true })` (see
  // playwright-runner.ts / playwright.ts), so the image's top-left is the document
  // origin — the composite offset is the current scroll. These two move together.
  return { dataUrl, offset: { x: window.scrollX, y: window.scrollY } };
}

async function onExport(payload: ExportPayload): Promise<void> {
  if (!window.__stmDeliver) return;
  await window.__stmDeliver(payload.markdown, await blobToBase64(payload.image));
}

function boot(): void {
  // `addInitScript` re-runs in every frame; only mount in the top frame, once.
  if (window.top !== window || window.__stm) return;
  void (async () => {
    const handle = await mount({
      styles: __STM_PANEL_CSS__,
      screenshot: captureScreenshot,
      onExport,
      // One delivery path (the binding → driver/daemon), so declare only the export
      // capability — a single button labelled for it (matches the `request --playwright`
      // banner); the automation `attach()` path drives `exportNow()` and ignores it.
      capabilities: AGENT_CAPABILITIES,
    });
    // Publish the handle on the page global so the channel driver can call it.
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- intentional page↔driver handoff
    window.__stm = handle;
  })();
}

// Init scripts can run before <body> exists; wait for the document if needed.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
