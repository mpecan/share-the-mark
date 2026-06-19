import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { test } from './fixtures';

// Minimal chrome typing for code evaluated inside the MV3 service worker.
declare global {
  var chrome: {
    tabs: {
      query: (q: { active: boolean; currentWindow: boolean }) => Promise<{ id?: number }[]>;
      sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
    };
  };
}

// Store-listing screenshot generator (not a gate — tagged @screenshots, excluded
// from `pnpm e2e`; run with `pnpm screenshots`). It seeds a curated multi-tool
// brief through the real M4 import flow so the overlay renders itself — the panel
// and marks live in a *closed* shadow root we can't click into, but a full-page
// capture grabs the pixels. Outputs 1280×800 PNGs to store/screenshots/.

/* eslint-disable
   unicorn/prefer-code-point,
   unicorn/prefer-uint8array-base64,
   unicorn/consistent-function-scoping,
   unicorn/consistent-boolean-name,
   unicorn/switch-case-braces,
   unicorn/no-break-in-nested-loop,
   unicorn/consistent-existence-index-check,
   @typescript-eslint/no-unnecessary-condition,
   @typescript-eslint/non-nullable-type-assertion-style --
   A non-shipped screenshot generator (tagged @screenshots, not in the CI gate or the
   bundle): it mirrors the extension's portable cyrb53/base64url encoding and runs DOM
   helpers inside page.evaluate, which fight these strict rules for no real benefit
   here. Verified by running it and inspecting the PNGs. */

const OUT = path.resolve('store/screenshots');
const PAGE_URL = 'https://stm.test/';
const DEMO_HTML = fs.readFileSync(path.resolve('tests/fixtures/demo.html'), 'utf8');
const VIEWPORT = { width: 1280, height: 800 };

// Mirrors src/core/share cyrb53 — replicated so this generator doesn't depend on
// the extension's module-alias resolution under Playwright's loader.
function cyrb53(input: string): string {
  let h1 = 0xde_ad_be_ef;
  let h2 = 0x41_c6_ce_57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2_654_435_761);
    h2 = Math.imul(h2 ^ ch, 1_597_334_677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
  return (4_294_967_296 * (2_097_151 & h2) + (h1 >>> 0)).toString(36);
}

// Mirrors src/share/token.ts encodeToken: gzip + base64url behind the magic prefix.
function encodeToken(brief: unknown): string {
  return `stm1:${Buffer.from(gzipSync(JSON.stringify(brief))).toString('base64url')}`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// A "pasted into an editor" frame for the exported Markdown changelog shot.
function markdownPage(markdown: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
    body { margin: 0; height: 800px; background: #0d1117; display: flex; align-items: center;
      justify-content: center; font-family: ui-sans-serif, system-ui, sans-serif; }
    .win { width: 760px; border: 1px solid #30363d; border-radius: 12px; overflow: hidden;
      box-shadow: 0 24px 70px -24px #000; }
    .bar { display: flex; gap: 8px; align-items: center; padding: 12px 16px; background: #161b22;
      border-bottom: 1px solid #30363d; }
    .dot { width: 11px; height: 11px; border-radius: 50%; }
    .name { margin-left: 10px; color: #8b949e; font-size: 13px;
      font-family: ui-monospace, monospace; }
    pre { margin: 0; padding: 24px; color: #c9d1d9; white-space: pre-wrap;
      font: 14px/1.75 ui-monospace, SFMono-Regular, Menlo, monospace; }
  </style></head><body><div class="win"><div class="bar">
    <span class="dot" style="background:#ff5f56"></span>
    <span class="dot" style="background:#ffbd2e"></span>
    <span class="dot" style="background:#27c93f"></span>
    <span class="name">change-brief.md</span></div>
    <pre>${escapeHtml(markdown)}</pre></div></body></html>`;
}

interface PlanItem {
  kind: 'callout' | 'text' | 'arrow' | 'highlight' | 'element';
  selector: string;
  phrase?: string;
  note?: string;
}

// Design-feedback marks, one per tool, anchored to the demo page's real content.
const PLAN: PlanItem[] = [
  { kind: 'callout', selector: '#hero', phrase: 'something', note: 'Tighten the headline' },
  {
    kind: 'text',
    selector: '#subtitle',
    phrase: 'ship, measure',
    note: 'Add a one-line proof point',
  },
  { kind: 'callout', selector: '#cta', phrase: 'Get started', note: 'Use the brand accent' },
  {
    kind: 'highlight',
    selector: '#card-secure',
    phrase: 'audit logs',
    note: 'Strong security proof',
  },
  { kind: 'element', selector: '#card-speed', note: 'Equalize the card heights' },
  { kind: 'arrow', selector: '#brand', phrase: 'Acme', note: 'Logo needs more contrast' },
];

test('@screenshots generate store screenshots', async ({ context, extensionId }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await context.route(PAGE_URL, (route) =>
    route.fulfill({ contentType: 'text/html', body: DEMO_HTML }),
  );

  // 1) Compute valid anchors against the live fixture DOM.
  const seed = await context.newPage();
  await seed.setViewportSize(VIEWPORT);
  await seed.goto(PAGE_URL);
  await seed.waitForFunction(() => document.documentElement.dataset['stmReady'] === 'true');
  const annotations = await seed.evaluate((plan: PlanItem[]) => {
    const textNodes = (el: Element): Text[] => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const out: Text[] = [];
      let node = walker.nextNode();
      while (node) {
        out.push(node as Text);
        node = walker.nextNode();
      }
      return out;
    };
    const rangeFor = (el: Element, start: number, end: number): Range | null => {
      const range = document.createRange();
      let acc = 0;
      let startSet = false;
      let endSet = false;
      for (const node of textNodes(el)) {
        const len = node.data.length;
        if (!startSet && start <= acc + len) {
          range.setStart(node, start - acc);
          startSet = true;
        }
        if (!endSet && end <= acc + len) {
          range.setEnd(node, end - acc);
          endSet = true;
          break;
        }
        acc += len;
      }
      return startSet && endSet ? range : null;
    };
    const rectOf = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });

    const out: Record<string, unknown>[] = [];
    let calloutIndex = 0;
    for (const [i, item] of plan.entries()) {
      const el = document.querySelector(item.selector);
      if (!el) continue;
      const target = {
        selector: item.selector,
        fallbacks: [],
        tag: el.tagName.toLowerCase(),
        rect: rectOf(el.getBoundingClientRect()),
      };
      const base: Record<string, unknown> = { id: `s${String(i)}`, createdAt: 0, target };
      if (item.note !== undefined) base['note'] = item.note;

      if (item.kind === 'element') {
        out.push({ ...base, kind: 'element' });
        continue;
      }
      const phrase = item.phrase;
      if (phrase === undefined) continue;
      const text = el.textContent ?? '';
      const start = text.indexOf(phrase);
      if (start < 0) continue;
      const end = start + phrase.length;
      const anchor = {
        start,
        end,
        exact: phrase,
        prefix: text.slice(Math.max(0, start - 32), start),
        suffix: text.slice(end, end + 32),
      };
      const box = (rangeFor(el, start, end) ?? el).getBoundingClientRect();

      switch (item.kind) {
        case 'highlight':
          out.push({ ...base, kind: 'highlight', anchor });
          break;
        case 'callout':
          // Pin just above-left of the anchored phrase, like a marker on the word.
          out.push({
            ...base,
            kind: 'callout',
            index: ++calloutIndex,
            anchor,
            offset: { dx: -10, dy: -24 },
          });
          break;
        case 'text':
          out.push({ ...base, kind: 'text', anchor, offset: { dx: 6, dy: box.height + 8 } });
          break;
        default:
          out.push({
            ...base,
            kind: 'arrow',
            anchor,
            offset: { dx: -10, dy: box.height / 2 },
            tail: { dx: -70, dy: -54 },
          });
      }
    }
    return out;
  }, PLAN);
  await seed.close();

  const content = {
    url: PAGE_URL,
    title: 'Acme — ship your product',
    capturedAt: 1_750_000_000_000,
    annotations,
  };
  const token = encodeToken({ v: 1, ...content, fingerprint: cyrb53(JSON.stringify(content)) });

  // 2) Import through the real popup flow → a new tab renders the marks + panel.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.fill('#stm-token', token);
  const openButton = popup.getByRole('button', { name: /open & place/i });
  await openButton.waitFor();
  const tabPromise = context.waitForEvent('page');
  await openButton.click();
  const shot = await tabPromise;

  await shot.setViewportSize(VIEWPORT);
  await shot.waitForFunction(() => document.documentElement.dataset['stmReady'] === 'true');
  await shot.locator('share-the-mark').waitFor({ state: 'attached' });
  await shot.waitForTimeout(700); // let resolveGeometry + observers settle
  await shot.screenshot({ path: path.join(OUT, '01-annotated.png') });

  // 2b) Trigger a real export to capture the Markdown changelog (the dataset is set
  // before the screenshot/clipboard step, so it's available even headless), then
  // render it as if pasted into an editor.
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      await chrome.tabs.sendMessage(tab.id, {
        id: 1,
        type: 'exportAnnotations',
        data: undefined,
        timestamp: Date.now(),
      });
    }
  });
  const handle = await shot.waitForFunction(
    () => document.documentElement.dataset['stmLastExport'],
  );
  const markdown = (await handle.jsonValue()) as string;
  await shot.close();

  const md = await context.newPage();
  await md.setViewportSize(VIEWPORT);
  await md.setContent(markdownPage(markdown));
  await md.screenshot({ path: path.join(OUT, '02-markdown.png') });
  await md.close();

  // 3) Options page (the "Agent integration" toggle).
  const options = await context.newPage();
  await options.setViewportSize(VIEWPORT);
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.waitForLoadState('domcontentloaded');
  await options.waitForTimeout(200);
  await options.screenshot({ path: path.join(OUT, '04-options.png') });
  await options.close();
});
