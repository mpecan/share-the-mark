import { test, expect } from '@playwright/test';
import { attach } from '@/src/embed/playwright';

// Channel A (SPEC §13.4): inject the embed into a page with NO extension installed,
// draw, and read the export back through the BindingSink → exposeBinding bridge.
// Uses the base @playwright/test fixtures (a plain Chromium context — crucially NOT
// the extension fixture in ./fixtures.ts), proving no-extension injection. Requires
// `pnpm build:embed` first (the e2e npm script chains it).

const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Fixture</title></head>
<body><main><h1>Fixture page</h1>
<button data-testid="primary-action" style="position:absolute;top:220px;left:160px;width:160px;height:44px">
Primary action</button></main></body></html>`;

test('injects the embed (no extension), draws a callout, and delivers the export', async ({
  page,
  context,
}) => {
  // attach() must precede goto — bindings + init scripts install per document.
  const handle = await attach(page);

  await context.route('https://stm.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: FIXTURE }),
  );
  await page.goto('https://stm.test/');

  // The bundle self-mounts on DOMContentLoaded and publishes the handle.
  // eslint-disable-next-line unicorn/prefer-global-this -- page context: the embed publishes its handle on window
  await page.waitForFunction(() => Boolean(window.__stm));

  // A real click routes into the (open) shadow overlay and anchors a callout to the
  // element beneath the pointer — same drive as annotate.spec.ts, without the SW.
  const box = await page.locator('[data-testid="primary-action"]').boundingBox();
  expect(box).not.toBeNull();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await handle.exportNow();
  const exported = await handle.waitForExport();

  expect(exported.markdown).toContain('Element: `[data-testid="primary-action"]`');
  // The image is the real page screenshot composited in-page and base64'd back.
  expect(exported.image.length).toBeGreaterThan(0);
  expect(exported.image.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
});
