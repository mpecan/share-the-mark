import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';

// The e2e build (`wxt build -m e2e`, run by the `e2e`/`screenshots` scripts) outputs
// here. It keeps a broad host grant so the worker can inject the content script, since
// headless Chromium can't gesture-grant activeTab (the shipped `chrome-mv3` build does
// not — see wxt.config.ts / check:perms).
const pathToExtension = path.resolve('.output/chrome-mv3-e2e');

// Playwright fixture that loads the built unpacked extension into a persistent
// Chromium context and exposes its generated extension id (SPEC §8.4).
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the empty fixture pattern here.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    // chrome-extension://<id>/background.js → host is the extension id.
    const extensionId = new URL(worker.url()).host;
    await use(extensionId);
  },
});

export const expect = test.expect;
