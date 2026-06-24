import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

// Builds the publishable `@share-the-mark/embed` package:
//   1. the prebuilt IIFE CDN bundles (reused from the root `build:embed`, so the
//      `<script src>`/unpkg consumers get the exact same artifacts the extension ships),
//   2. the importable ESM library + bundled .d.ts (tsup → dist/index.*, dist/playwright.*),
//   3. the CDN bundles copied in next to the library.
// Run from the package dir (npm/pnpm sets cwd here): `pnpm --filter @share-the-mark/embed build`.

const root = new URL('../../', import.meta.url);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

rmSync('dist', { recursive: true, force: true });

// 1. IIFE CDN bundles → repo `.output/embed/*.global.js`
run('pnpm', ['-w', 'run', 'build:embed']);

// 2. importable library (ESM + types)
run('pnpm', ['exec', 'tsup']);

// 3. ship the CDN bundles alongside the library
mkdirSync('dist', { recursive: true });
for (const name of ['embed.global.js', 'share-the-mark.global.js', 'local.global.js']) {
  cpSync(new URL(`.output/embed/${name}`, root), `dist/${name}`);
}

console.log('built @share-the-mark/embed → dist/ (index, playwright, + 3 CDN bundles)');
