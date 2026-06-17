import { defineConfig, devices } from '@playwright/test';

// See SPEC §8.4. M1 e2e is the Chromium gate: load the built unpacked
// extension from `.output/chrome-mv3`, drive a fixture page, and assert the
// exported clipboard Markdown. `pnpm build` must run before `pnpm e2e`.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
