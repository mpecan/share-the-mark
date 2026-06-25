import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// Bundle panel.css into a single string — esbuild resolves its `@import`s (the
// shared src/ui/controls.css), which a plain readFileSync would leave dangling.
const cssBundle = await build({
  entryPoints: ['src/panel/panel.css'],
  bundle: true,
  minify: true,
  write: false,
  loader: { '.css': 'css' },
});
const css = cssBundle.outputFiles[0].text;

// The package version, inlined so the embed reports a real version on the daemon
// compat handshake (mount.ts) instead of a placeholder.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

// Bundles the browser-free embed UI into self-contained IIFEs:
//   - standalone.ts  → embed.global.js          — Playwright injection (channel A, §13.4)
//   - widget.ts      → share-the-mark.global.js — dev `<script>` widget (channel B, §13.5)
//   - local.ts       → local.global.js          — local-serve self-mount (channel C, §13.6)
// plus a Node-side Playwright runner (playwright-runner.mjs) for the headed,
// interactive `request --playwright` flow (channel A driver, §13.4) — it inlines the
// channel-A IIFE and keeps `playwright` external (resolved from the user's env).
// The panel CSS is inlined as a `define` constant (the embed has no WXT
// `cssInjectionMode`). NODE_ENV=production is load-bearing: without it React 19
// ships dev-only warnings and bloats the bundle.

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
    __STM_VERSION__: JSON.stringify(version),
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
// Channel C — self-mounting (no globalName); captures the page and POSTs the brief
// to the local daemon that served it. The daemon injects this as a <script>.
await build({
  ...shared,
  entryPoints: ['src/embed/local.ts'],
  outfile: '.output/embed/local.global.js',
});

// The Node-side runner for `request --playwright` — an ESM script for Node, not a
// browser IIFE. Inlines the channel-A bundle just built (so the runner is one file)
// and keeps `playwright` external so it resolves from the user's environment.
const channelA = readFileSync('.output/embed/embed.global.js', 'utf8');
await build({
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  legalComments: 'none',
  tsconfig: 'tsconfig.json',
  entryPoints: ['src/embed/playwright-runner.ts'],
  outfile: '.output/embed/playwright-runner.mjs',
  external: ['playwright', '@playwright/test', 'playwright-core'],
  define: { __STM_EMBED_BUNDLE__: JSON.stringify(channelA) },
});

console.log(
  'built embed.global.js + share-the-mark.global.js + local.global.js + playwright-runner.mjs',
);
