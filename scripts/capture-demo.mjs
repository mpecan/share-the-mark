import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Record a short, looping GIF of the annotation flow for the docs homepage: drive
// the Channel-B embed widget (the built share-the-mark.global.js) on a sample page,
// drop a few callouts while a synthetic cursor moves, then export — capturing it all
// to video and converting to an optimized GIF with ffmpeg.
//
// Prereqs: `pnpm build:embed` (produces the bundle) and ffmpeg on PATH.
// Run:     node scripts/capture-demo.mjs   → writes website/public/demo-annotate.gif
//
// Output lives in website/public/ (served verbatim) rather than docs/assets/ so
// Astro's image pipeline can't de-animate it; the homepage embeds it with a raw
// <img src="/demo-annotate.gif">.

const BUNDLE = '.output/embed/share-the-mark.global.js';
const OUT = 'website/public/demo-annotate.gif';
const VIEW = { width: 960, height: 680 };
const GIF_WIDTH = 800;
const FPS = 12;

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
    <p class="lead" data-t="lead">A starter dashboard — annotate anything on it and hand the feedback to your agent.</p>
    <div class="cards">
      <div class="card"><h3>Analytics</h3><p data-t="card">Track what matters in real time.</p></div>
      <div class="card"><h3>Billing</h3><p>Usage-based, no surprises.</p></div>
    </div>
    <button class="cta" data-t="cta">Get started</button>
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

async function annotate(page, selector) {
  const box = await page.locator(`[data-t="${selector}"]`).boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
  await page.waitForTimeout(450);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(750);
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

  // Default tool is callout — click a few elements to drop numbered markers.
  for (const target of ['title', 'card', 'cta']) await annotate(page, target);

  // Export (Copy to clipboard) to show the changelog handoff.
  const exportBtn = page.locator('.stm-panel__export');
  const box = await exportBtn.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await page.waitForTimeout(400);
    await exportBtn.click();
  }
  await page.waitForTimeout(1200);

  await context.close();
  await browser.close();

  const webm = readdirSync(videoDir).find((file) => file.endsWith('.webm'));
  if (!webm) fail('no video was recorded.');
  const webmPath = path.join(videoDir, webm);
  const palette = path.join(videoDir, 'palette.png');
  const filters = `fps=${String(FPS)},scale=${String(GIF_WIDTH)}:-1:flags=lanczos`;
  execFileSync(
    'ffmpeg',
    ['-y', '-i', webmPath, '-vf', `${filters},palettegen=stats_mode=diff`, palette],
    {
      stdio: 'ignore',
    },
  );
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      webmPath,
      '-i',
      palette,
      '-lavfi',
      `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
      OUT,
    ],
    { stdio: 'ignore' },
  );
  rmSync(videoDir, { recursive: true, force: true });
  console.log(`✓ wrote ${OUT}`);
}

await main();
