import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// Bundles the browser-free embed UI into self-contained IIFEs:
//   - standalone.ts  → embed.global.js          — Playwright injection (channel A, §13.4)
//   - widget.ts      → share-the-mark.global.js — dev `<script>` widget (channel B, §13.5)
// The panel CSS is inlined as a `define` constant (the embed has no WXT
// `cssInjectionMode`). NODE_ENV=production is load-bearing: without it React 19
// ships dev-only warnings and bloats the bundle.

const css = readFileSync('src/panel/panel.css', 'utf8');

const shared = {
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
};

// Channel A — self-publishes `window.__stm`, so no globalName.
await build({
  ...shared,
  entryPoints: ['src/embed/standalone.ts'],
  outfile: '.output/embed/embed.global.js',
});
// Channel B — esbuild assigns the entry's exports to `window.ShareTheMark`, so the
// page can call `ShareTheMark.init({...})`.
await build({
  ...shared,
  entryPoints: ['src/embed/widget.ts'],
  outfile: '.output/embed/share-the-mark.global.js',
  globalName: 'ShareTheMark',
});

console.log('built .output/embed/embed.global.js + share-the-mark.global.js');
