import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Record a short, looping demo of the annotation flow for the docs homepage: drive
// the Channel-B embed widget (the built share-the-mark.global.js) on a sample page,
// drop a callout and an element comment (two tools), type notes into the changelog,
// then export — capturing it to video. Encodes a webm + an MP4 (H.264, for Safari)
// + a poster frame with ffmpeg; the homepage embeds them in a looping <video>.
//
// Prereqs: `pnpm build:embed` (produces the bundle) and ffmpeg on PATH.
// Run:     node scripts/capture-demo.mjs   (or `pnpm docs:demo`)
//
// Output lives in website/public/ (served verbatim) and is embedded on the homepage
// with <video autoplay loop muted playsinline>.

const BUNDLE = '.output/embed/share-the-mark.global.js';
const OUT_WEBM = 'website/public/demo-annotate.webm';
const OUT_MP4 = 'website/public/demo-annotate.mp4';
const OUT_POSTER = 'website/public/demo-annotate.png';
const VIEW = { width: 960, height: 680 };

function fail(message) {
  console.error(`✖ capture-demo: ${message}`);
  // eslint-disable-next-line unicorn/no-process-exit -- CLI tool; exit code is its contract.
  process.exit(1);
}

// A clean sample UI to annotate, plus a synthetic cursor + click ripple so the
// recording reads as a real interaction (Playwright's video doesn't draw the OS cursor).
const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>Acme dashboard</title>
<script src="https://demo.stm/share-the-mark.global.js"></script>
<style>
  :root { --rose:#e11d48; }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.5 system-ui,sans-serif; color:#0f172a; background:#f8fafc; }
  header { display:flex; align-items:center; justify-content:space-between;
    padding:18px 32px; background:#fff; border-bottom:1px solid #e2e8f0; }
  .brand { font-weight:700; font-size:18px; }
  nav a { margin-left:20px; color:#475569; text-decoration:none; font-size:14px; }
  main { max-width:760px; margin:40px auto; padding:0 24px; }
  h1 { font-size:30px; margin:0 0 8px; }
  p.lead { color:#475569; margin:0 0 28px; }
  .cards { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; }
  .card h3 { margin:0 0 6px; font-size:16px; }
  .card p { margin:0; color:#64748b; font-size:14px; }
  .cta { display:inline-block; margin-top:28px; background:var(--rose); color:#fff;
    padding:12px 22px; border-radius:10px; font-weight:600; border:0; font:inherit; cursor:pointer; }
  #cur { position:fixed; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:50%;
    background:rgba(225,29,72,.85); box-shadow:0 0 0 4px rgba(225,29,72,.25);
    pointer-events:none; z-index:2147483647; transition:transform .05s linear; left:0; top:0; }
  .ripple { position:fixed; width:10px; height:10px; margin:-5px 0 0 -5px; border-radius:50%;
    border:2px solid var(--rose); pointer-events:none; z-index:2147483646; animation:rip .5s ease-out forwards; }
  @keyframes rip { to { transform:scale(5); opacity:0; } }
</style></head>
<body>
  <header><span class="brand">Acme</span>
    <nav><a href="#">Docs</a><a href="#">Pricing</a><a href="#">Sign in</a></nav></header>
  <main>
    <h1 data-t="title">Ship faster with Acme</h1>
    <p class="lead">A starter dashboard — annotate anything on it and hand the feedback to your agent.</p>
    <div class="cards">
      <div class="card" data-t="card"><h3>Analytics</h3><p>Track what matters in real time.</p></div>
      <div class="card"><h3>Billing</h3><p>Usage-based, no surprises.</p></div>
    </div>
    <button class="cta">Get started</button>
  </main>
  <div id="cur"></div>
  <script>
    const cur = document.getElementById('cur');
    addEventListener('mousemove', (e) => { cur.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = 'ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => { r.remove(); }, 500);
    }, true);
    addEventListener('DOMContentLoaded', () => ShareTheMark.init({ onSubmit: () => {} }));
  </script>
</body></html>`;

// Move the synthetic cursor to an element's centre, then click it.
async function clickTarget(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) fail(`target not found: ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
  await page.waitForTimeout(500);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(700);
}

// Type a note into the most recently added changelog entry, char by char.
async function typeNote(page, text) {
  const input = page.locator('.stm-item__note').last();
  await input.click();
  await page.waitForTimeout(250);
  await input.pressSequentially(text, { delay: 38 });
  await page.waitForTimeout(700);
}

async function main() {
  let bundleJs;
  try {
    bundleJs = readFileSync(BUNDLE, 'utf8');
  } catch {
    fail(`missing ${BUNDLE} — run \`pnpm build:embed\` first.`);
  }
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    fail('ffmpeg not found on PATH.');
  }

  const videoDir = mkdtempSync(path.join(tmpdir(), 'stm-demo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    recordVideo: { dir: videoDir, size: VIEW },
  });
  const page = await context.newPage();
  await context.route('https://demo.stm/share-the-mark.global.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: bundleJs }),
  );
  await context.route('https://demo.stm/', (route) =>
    route.fulfill({ contentType: 'text/html', body: FIXTURE }),
  );
  await page.goto('https://demo.stm/');
  await page.locator('[data-stm-embed="true"]').waitFor({ state: 'attached' });
  await page.waitForTimeout(900);

  // 1. Callout (the default tool) on the headline, with a note.
  await clickTarget(page, '[data-t="title"]');
  await typeNote(page, 'Punchier headline here?');

  // 2. Switch to the element tool, comment on a whole card.
  await page.locator('.stm-tool[aria-label="element"]').click();
  await page.waitForTimeout(500);
  await clickTarget(page, '[data-t="card"]');
  await typeNote(page, 'Add a "Learn more" link');

  // 3. Export (Copy to clipboard) to show the changelog handoff.
  const exportBtn = page.locator('.stm-panel__export');
  const box = await exportBtn.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await page.waitForTimeout(400);
    await exportBtn.click();
  }
  await page.waitForTimeout(1400);

  await context.close();
  await browser.close();

  const recording = readdirSync(videoDir).find((file) => file.endsWith('.webm'));
  if (!recording) fail('no video was recorded.');
  const webmPath = path.join(videoDir, recording);

  // webm: ship the raw recording. mp4: H.264 + yuv420p + faststart for Safari/broad
  // support (even dimensions required). poster: the first frame.
  copyFileSync(webmPath, OUT_WEBM);
  execFileSync(
    'ffmpeg',
    // prettier-ignore
    ['-y', '-i', webmPath, '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '24', OUT_MP4],
    { stdio: 'ignore' },
  );
  execFileSync('ffmpeg', ['-y', '-i', webmPath, '-frames:v', '1', OUT_POSTER], { stdio: 'ignore' });
  rmSync(videoDir, { recursive: true, force: true });
  console.log(`✓ wrote ${OUT_WEBM}, ${OUT_MP4}, ${OUT_POSTER}`);
}

await main();
