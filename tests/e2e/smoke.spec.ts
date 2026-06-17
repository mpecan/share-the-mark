import { test, expect } from './fixtures';

// M0 e2e gate: the built extension loads and registers its MV3 service worker.
// M1 extends this to activate annotation mode, draw a callout, export, and
// assert the clipboard Markdown contains the expected selector line (SPEC §8.4).
test('the built extension registers its service worker', ({ extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
});
