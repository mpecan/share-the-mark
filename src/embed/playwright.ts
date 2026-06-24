/* eslint-disable unicorn/prefer-uint8array-base64 -- Node-side helper; Buffer base64 is idiomatic here. */
import type { Page } from '@playwright/test';

// Node-side helper for channel A (SPEC §13.4): inject the embed bundle into a page
// with NO extension installed, and read the export back. `attach()` must be called
// BEFORE `page.goto` — `exposeBinding` and `addInitScript` install per document
// creation. Data flow (everything crosses `exposeBinding` as JSON, so images are
// base64 — Blobs do not survive the bridge):
//
//   page draw → __stm.exportNow() → session export → captureScreenshot()
//     → __stmScreenshot()  →[Node] page.screenshot() → base64 → page builds dataURL
//   → compositeAnnotations() in-page (real OffscreenCanvas) → image Blob
//     → __stmDeliver(markdown, base64(image))  →[Node] resolves waitForExport()
//
// This file is Node-only (imports @playwright/test) and is excluded from coverage,
// like src/capture/composite-surface.ts; it's exercised by tests/e2e.

const DEFAULT_BUNDLE_PATH = '.output/embed/embed.global.js';

export interface AttachOptions {
  /** Path to the built embed IIFE (default: `.output/embed/embed.global.js`). */
  bundlePath?: string;
}

export interface EmbedExport {
  markdown: string;
  image: Buffer;
}

export interface EmbedHandle {
  /** Resolves with the first export delivered from the page. */
  waitForExport(): Promise<EmbedExport>;
  /** Trigger the embed's export programmatically (no panel click needed). */
  triggerExport(): Promise<void>;
}

export async function attach(page: Page, opts: AttachOptions = {}): Promise<EmbedHandle> {
  let resolveExport!: (value: EmbedExport) => void;
  const exportPromise = new Promise<EmbedExport>((resolve) => {
    resolveExport = resolve;
  });

  await page.exposeBinding('__stmScreenshot', async ({ page: target }) => {
    // Full-page capture: paired with the page side reporting scroll as the composite
    // offset (standalone.ts), so marks below the fold land on their elements.
    const buffer = await target.screenshot({ fullPage: true });
    return buffer.toString('base64');
  });
  await page.exposeBinding('__stmDeliver', (_source, markdown: string, imageBase64: string) => {
    resolveExport({ markdown, image: Buffer.from(imageBase64, 'base64') });
  });

  await page.addInitScript({ path: opts.bundlePath ?? DEFAULT_BUNDLE_PATH });

  return {
    waitForExport: () => exportPromise,
    triggerExport: () =>
      // eslint-disable-next-line unicorn/prefer-global-this -- page context: the handle is published on window
      page.evaluate(() => window.__stm?.exportNow()),
  };
}
