import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

// Reset the in-memory fake `browser` between tests so storage/messaging state
// never leaks across cases (SPEC §8.4).
beforeEach(() => {
  fakeBrowser.reset();
});
