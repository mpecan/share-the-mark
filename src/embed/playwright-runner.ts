/* eslint-disable unicorn/no-process-exit -- this *is* a CLI app; exit codes are its contract. */
/* eslint-disable unicorn/prefer-uint8array-base64 -- Node Buffer base64 is idiomatic here. */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BrowserType } from '@playwright/test';
import type { ExportMeta } from '@/src/core/export';

// Node runner for `share-the-mark request --playwright <url>` (SPEC §13.4): launch a
// HEADED, interactive Chromium with NO extension installed, inject the Channel A
// embed bundle (inlined below), navigate to the URL, and POST the brief the user
// produces to the daemon's /brief — which fulfils the open request the Rust CLI
// registered, so its poll loop wakes the agent. Mirrors the bindings of
// src/embed/playwright.ts (attach), but headed + interactive instead of automated.
//
// `playwright` is resolved from the user's environment at runtime (kept external by
// esbuild) so the Rust binary stays self-contained. Coverage-excluded Node/browser
// glue, like src/capture/composite-surface.ts and src/embed/standalone.ts.

// The built Channel A IIFE (embed.global.js), inlined by scripts/build-embed.mjs so
// the runner is a single self-contained .mjs.
declare const __STM_EMBED_BUNDLE__: string;

interface Args {
  url: string;
  brief: string;
}

interface BriefBody {
  markdown: string;
  meta: ExportMeta;
  imageBase64: string;
}

const PLAYWRIGHT_PACKAGES = ['playwright', '@playwright/test', 'playwright-core'];

// The runner is staged to a temp dir by the Rust CLI, so `import.meta`-relative
// resolution finds nothing. Resolve Playwright from where it actually lives: the
// caller's working directory (a project-local install, also honouring NODE_PATH) and
// the npm global root (`npm i -g playwright`). Each base is tried for each package
// name; absolute-path requires let us reach the global root explicitly.
function requireBases(): ((name: string) => unknown)[] {
  const cwdEntry = pathToFileURL(path.join(process.cwd(), 'noop.js')).href;
  const fromCwd = createRequire(cwdEntry);
  const fromHere = createRequire(import.meta.url);
  const bases: ((name: string) => unknown)[] = [
    (name) => fromCwd(name) as unknown,
    (name) => fromHere(name) as unknown,
  ];
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    if (globalRoot.length > 0)
      bases.push((name) => fromHere(path.join(globalRoot, name)) as unknown);
  } catch {
    // npm not available — global installs just won't be found.
  }
  return bases;
}

// Resolve a browser launcher from whatever Playwright package the user has. Errors
// with an actionable message if none is installed (the flag is opt-in, never baked).
function loadChromium(): BrowserType {
  for (const resolveFrom of requireBases()) {
    for (const name of PLAYWRIGHT_PACKAGES) {
      try {
        return (resolveFrom(name) as { chromium: BrowserType }).chromium;
      } catch {
        // try the next package / base
      }
    }
  }
  throw new Error(
    'Playwright is not installed. Install it (e.g. `npm i -g playwright && playwright install chromium`) and retry.',
  );
}

function parseArgs(argv: readonly string[]): Args {
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const url = valueOf('--url');
  const brief = valueOf('--brief');
  if (url === undefined || brief === undefined) {
    console.error('usage: playwright-runner --url <page> --brief <daemon /brief endpoint>');
    process.exit(64);
  }
  return { url, brief };
}

async function postBrief(endpoint: string, body: BriefBody): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`daemon responded ${String(response.status)}`);
}

async function main(): Promise<void> {
  const { url, brief } = parseArgs(process.argv.slice(2));
  const chromium = loadChromium();

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // A mutable state bag (not bare `let`s): the flags are set inside the binding
  // callbacks, and reading object properties keeps their declared types — bare locals
  // would be narrowed to their initializers across the closure boundary.
  const state: { delivered: boolean; failure: string | null } = {
    delivered: false,
    failure: null,
  };

  // page → driver: a real full-page screenshot (Channel A's screenshot seam). Paired
  // with the page side reporting the scroll as the composite offset (standalone.ts).
  await page.exposeBinding('__stmScreenshot', async ({ page: target }) => {
    const png = await target.screenshot({ fullPage: true });
    return png.toString('base64');
  });
  // panel "Send to agent" → BindingSink → here: build meta (origin must match the
  // registered request) and POST the brief, then close the window.
  await page.exposeBinding(
    '__stmDeliver',
    async (_source, markdown: string, imageBase64: string) => {
      try {
        await postBrief(brief, {
          markdown,
          meta: { url: page.url(), title: await page.title(), capturedAt: Date.now() },
          imageBase64,
        });
        state.delivered = true;
        console.error('share-the-mark: brief sent ✓');
      } catch (error) {
        state.failure = error instanceof Error ? error.message : String(error);
        console.error(`share-the-mark: failed to send the brief — ${state.failure}`);
      }
      await browser.close();
    },
  );
  await page.addInitScript({ content: __STM_EMBED_BUNDLE__ });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.error(
    `share-the-mark: annotate ${url} in the window and click "Send to agent". Close the window to cancel.`,
  );

  // Block until the brief is delivered (which closes the browser) or the user closes
  // the window themselves — both surface as `disconnected`.
  await new Promise<void>((resolve) => {
    browser.on('disconnected', () => {
      resolve();
    });
  });

  if (state.failure !== null) process.exit(1);
  if (!state.delivered) {
    console.error('share-the-mark: window closed before a brief was sent (cancelled).');
    process.exit(2);
  }
  process.exit(0);
}

await main();
