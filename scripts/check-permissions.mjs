import { readFileSync } from 'node:fs';

// Guards the least-privilege win of the activeTab refactor: the *production* Chrome
// build must request no broad host access at install. Run after `pnpm build` (not
// the `-m e2e` build, which statically registers a fixture-scoped content script).

const PATH = '.output/chrome-mv3/manifest.json';
const manifest = JSON.parse(readFileSync(PATH, 'utf8'));
const problems = [];

if ((manifest.host_permissions ?? []).includes('<all_urls>')) {
  problems.push('host_permissions contains <all_urls> — that triggers the broad install warning.');
}

const contentScripts = manifest.content_scripts ?? [];
if (contentScripts.length > 0) {
  const matches = JSON.stringify(contentScripts.flatMap((script) => script.matches ?? []));
  problems.push(`content_scripts is non-empty (${matches}) — did you build with \`-m e2e\`?`);
}

if (!(manifest.optional_host_permissions ?? []).includes('<all_urls>')) {
  problems.push(
    'optional_host_permissions is missing <all_urls> — the per-origin import request needs it.',
  );
}

if (problems.length > 0) {
  console.error(`✖ ${PATH} permission check failed:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  // eslint-disable-next-line unicorn/no-process-exit -- this is a CLI check.
  process.exit(1);
}

console.log(
  '✓ permissions: activeTab only (no broad host access), content_scripts empty, <all_urls> optional.',
);
