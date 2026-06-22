import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// See SPEC §8.4. happy-dom + globals, fakeBrowser wired via setup, and the
// CI-enforced coverage thresholds (stricter for the pure core).
export default defineConfig({
  plugins: [WxtVitest()],
  // The widget bundle inlines the panel CSS via this esbuild `define`; mirror it
  // here as empty so `src/embed/widget.ts` is importable under vitest.
  define: { __STM_PANEL_CSS__: '""' },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        // Irreducible browser glue (OffscreenCanvas/createImageBitmap) that
        // cannot run under happy-dom; the orchestration it backs is tested via
        // dependency injection. See src/capture/composite.ts.
        'src/capture/composite-surface.ts',
        // Channel-A injection glue (SPEC §13.4): the IIFE entry (binding globals,
        // DOM boot) and the Node-side Playwright helper can't run under happy-dom;
        // both are exercised by tests/e2e/embed-playwright.spec.ts. mount.ts (the
        // logic they wrap) stays covered.
        'src/embed/standalone.ts',
        'src/embed/playwright.ts',
        // Default DOM-capture provider (html-to-image / real foreignObject canvas);
        // same rationale as composite-surface.ts. Exercised by the channel-B e2e.
        'src/embed/screenshot.ts',
      ],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
        // The pure core (SPEC §5.2-5.5) must be exhaustively covered.
        'src/core/**': {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 95,
        },
      },
    },
  },
});
