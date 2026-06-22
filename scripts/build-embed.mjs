import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// Bundles the browser-free embed UI (src/embed/standalone.ts) into a single
// self-contained IIFE for injection into an arbitrary page via Playwright
// `addInitScript` (SPEC §13.4, channel A) — and later a CDN `<script>` (channel B).
// The panel CSS is inlined as a `define` constant (the embed has no WXT
// `cssInjectionMode`). NODE_ENV=production is load-bearing: without it React 19
// ships dev-only warnings and bloats the bundle.

const css = readFileSync('src/panel/panel.css', 'utf8');

await build({
  entryPoints: ['src/embed/standalone.ts'],
  outfile: '.output/embed/embed.global.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  // Resolve the `@/*` path alias from tsconfig.
  tsconfig: 'tsconfig.json',
  define: {
    'process.env.NODE_ENV': '"production"',
    __STM_PANEL_CSS__: JSON.stringify(css),
  },
});

console.log('built .output/embed/embed.global.js');
