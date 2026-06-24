import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// Builds the importable library: ESM + bundled .d.ts for the browser widget entry.
// The panel CSS and NODE_ENV are inlined exactly as the root IIFE build does
// (scripts/build-embed.mjs) — the widget mounts its styles into its own shadow root,
// so it must carry them. The Node-side Playwright `attach` driver is intentionally
// not part of the typed npm surface (see build.mjs / package README); the
// `embed.global.js` CDN bundle it injects is still shipped.
const css = readFileSync(new URL('../../src/panel/panel.css', import.meta.url), 'utf8');

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    __STM_PANEL_CSS__: JSON.stringify(css),
  },
  tsconfig: 'tsconfig.json',
});
