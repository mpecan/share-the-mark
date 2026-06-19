import { test, expect } from './fixtures';

// The content script is injected on demand under activeTab (not in the manifest).
// Headless Chromium can't gesture-grant activeTab, so the e2e build keeps a broad
// host grant and the worker injects the script the way the background would.
async function injectContentScript(worker: {
  evaluate: (fn: () => Promise<void>) => Promise<void>;
}): Promise<void> {
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['/content-scripts/content.js'],
      });
    }
  });
}

const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Fixture</title></head>
<body><main><h1>Fixture page</h1>
<button data-testid="primary-action" style="position:absolute;top:220px;left:160px;width:160px;height:44px">
Primary action</button></main></body></html>`;

async function messageActiveTab(
  worker: { evaluate: (fn: (type: string) => Promise<void>, arg: string) => Promise<void> },
  type: string,
): Promise<void> {
  await worker.evaluate(async (messageType: string) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      await chrome.tabs.sendMessage(tab.id, {
        id: Math.floor(Math.random() * 1e6),
        type: messageType,
        data: undefined,
        timestamp: Date.now(),
      });
    }
  }, type);
}

test('draws a callout and exports Markdown carrying the resolved selector', async ({
  context,
  page,
}) => {
  await context.route('https://stm.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: FIXTURE }),
  );
  await page.goto('https://stm.test/');

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // Inject the content script (it auto-mounts the overlay on injection).
  await injectContentScript(worker);
  await page.waitForFunction(() => document.documentElement.dataset['stmReady'] === 'true');
  await page.locator('share-the-mark').waitFor({ state: 'attached' });

  // A real click routes into the closed shadow root and the overlay anchors a
  // callout to the element beneath the pointer.
  const box = await page.locator('[data-testid="primary-action"]').boundingBox();
  expect(box).not.toBeNull();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await messageActiveTab(worker, 'exportAnnotations');

  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset['stmLastExport'] ?? ''))
    .toContain('Element: `[data-testid="primary-action"]`');
});
