import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// See SPEC §8.4. happy-dom + globals, fakeBrowser wired via setup, and the
// CI-enforced coverage thresholds (stricter for the pure core).
export default defineConfig({
  plugins: [WxtVitest()],
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
