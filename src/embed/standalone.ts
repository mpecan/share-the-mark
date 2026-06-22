/* eslint-disable unicorn/prefer-global-this -- this script runs injected in the
   page; `window` is the page global the Playwright bindings + the handle live on. */
import { mount, type StmHandle } from './mount';
import type { ExportPayload } from '@/src/core/export';

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

// Base64 of the PNG via FileReader (the same idiom as src/capture/daemon-sink.ts;
// duplicated here rather than imported, since that module pulls the message bus
// which must stay out of the embed bundle).
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      // readAsDataURL yields `data:<type>;base64,<payload>` — keep the payload.
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('failed to read image'));
    });
    reader.readAsDataURL(blob);
  });
}

async function captureScreenshot(): Promise<string> {
  if (!window.__stmScreenshot) throw new Error('share-the-mark: no screenshot binding');
  return `data:image/png;base64,${await window.__stmScreenshot()}`;
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
