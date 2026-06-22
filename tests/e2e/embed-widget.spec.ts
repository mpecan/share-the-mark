import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Channel B (SPEC §13.5): the dev `<script>` widget on a plain page with NO extension
// and NO Playwright bindings — proving the `ShareTheMark.init` global loaded from a
// real `<script src>` and the default in-browser html-to-image capture. Requires
// `pnpm build:embed` first (the e2e npm script chains it). Distinct from
// embed-playwright.spec.ts (which injects via addInitScript + exposeBinding).

const BUNDLE = readFileSync('.output/embed/share-the-mark.global.js', 'utf8');

const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Fixture</title>
<script src="https://stm.test/share-the-mark.global.js"></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    ShareTheMark.init({
      onSubmit: (payload) => { document.documentElement.dataset.stmSubmitted = payload.markdown; },
    });
  });
</script></head>
<body><main><h1>Fixture page</h1>
<button data-testid="primary-action" style="position:absolute;top:220px;left:160px;width:160px;height:44px">
Primary action</button></main></body></html>`;

test('a <script>-tag widget (no extension) draws and delivers feedback to onSubmit', async ({
  page,
  context,
}) => {
  await context.route('https://stm.test/share-the-mark.global.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: BUNDLE }),
  );
  await context.route('https://stm.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: FIXTURE }),
  );
  await page.goto('https://stm.test/');

  // The widget mounts on DOMContentLoaded (open shadow root host).
  await page.locator('[data-stm-embed="true"]').waitFor({ state: 'attached' });

  // Draw a callout (default tool) with a real click, then export via the panel's
  // button — a real click into the open shadow root (Playwright pierces it).
  const box = await page.locator('[data-testid="primary-action"]').boundingBox();
  expect(box).not.toBeNull();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await page.locator('.stm-panel__export').click();

  // onSubmit ran the full path (default html-to-image capture → composite → deliver).
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset['stmSubmitted'] ?? ''))
    .toContain('Element: `[data-testid="primary-action"]`');
});
