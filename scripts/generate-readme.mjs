import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Generate README.md from the structured `docs/` folder — the single source of
// truth that also powers the documentation site (website/). Each top-level
// `docs/*.md` is a section: its frontmatter `title` becomes a `##` heading and its
// `sidebar.order` (or `order`) sets the position; the body follows. The README is
// wrapped with `docs/_readme/header.md` (intro + badges) and `footer.md` (license).
//
// Excluded: `docs/_readme/**` (the wrappers), anything starting with `_`, `.mdx`
// pages (the Starlight splash landing), and any doc with `readme: false`.
//
// Run `node scripts/generate-readme.mjs` to write README.md, or `--check` to fail
// when README.md is stale (CI guard). No dependencies — the frontmatter is ours.

const DOCS = 'docs';
const README = 'README.md';

function splitFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { frontmatter: '', body: raw };
  return { frontmatter: match[1] ?? '', body: match[2] ?? '' };
}

function field(frontmatter, name) {
  const line = new RegExp(String.raw`^${name}:\s*(.+)$`, 'm').exec(frontmatter);
  return line ? line[1].trim().replaceAll(/^['"]|['"]$/g, '') : undefined;
}

function order(frontmatter) {
  // Matches `order:` whether top-level or nested under `sidebar:`.
  const match = /^\s*order:\s*(\d+)\s*$/m.exec(frontmatter);
  return match ? Number(match[1]) : 99;
}

function sections() {
  return readdirSync(DOCS)
    .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
    .map((name) => {
      const { frontmatter, body } = splitFrontmatter(readFileSync(path.join(DOCS, name), 'utf8'));
      const title = field(frontmatter, 'title');
      // Skip pages with no title or `readme: false` (the site-only splash landing).
      if (!title || field(frontmatter, 'readme') === 'false') return;
      return { name, body, title, order: order(frontmatter) };
    })
    .filter((doc) => doc !== undefined)
    .toSorted((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function render() {
  const header = readFileSync(path.join(DOCS, '_readme', 'header.md'), 'utf8').trimEnd();
  const footer = readFileSync(path.join(DOCS, '_readme', 'footer.md'), 'utf8').trim();

  const body = sections()
    .map((doc) => {
      // Rewrite doc-relative asset paths to repo-root-relative ones for the README.
      const text = doc.body.trim().replaceAll('](./assets/', '](docs/assets/');
      return `## ${doc.title}\n\n${text}`;
    })
    .join('\n\n');

  return `${header}\n\n${body}\n\n${footer}\n`;
}

const generated = render();

if (process.argv.includes('--check')) {
  const current = readFileSync(README, 'utf8');
  if (current !== generated) {
    console.error('✖ README.md is out of date — run `pnpm docs:readme` and commit the result.');
    // eslint-disable-next-line unicorn/no-process-exit -- CI guard; exit code is its contract.
    process.exit(1);
  }
  console.log('✓ README.md is in sync with docs/.');
} else {
  writeFileSync(README, generated);
  console.log('✓ wrote README.md from docs/.');
}
