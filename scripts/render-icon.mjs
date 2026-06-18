// Rasterize design/icon.svg into the extension icon PNGs (public/icon/*.png)
// using Playwright's Chromium — no external image toolchain needed.
//   node scripts/render-icon.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(path.resolve(root, 'design/icon.svg'), 'utf8');
const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
const sizes = [16, 32, 48, 96, 128];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of sizes) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0">` +
      `<img src="${dataUrl}" width="${size}" height="${size}" style="display:block"/></body></html>`,
  );
  const img = await page.$('img');
  await img.screenshot({
    path: path.resolve(root, `public/icon/${size}.png`),
    omitBackground: true,
  });
  console.log(`rendered public/icon/${size}.png`);
}
await browser.close();
