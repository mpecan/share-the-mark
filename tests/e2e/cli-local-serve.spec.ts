import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';

// Channel C end-to-end (SPEC §13.6), tagged `@cli` — excluded from the default
// `pnpm e2e` because it needs the built Rust daemon. Run via `pnpm e2e:cli`, which
// `mise run cli:build`s the binary (with the embed bundle baked in) first.
//
// The full loop, in a real browser, with NO extension and NO --bundle override (so
// it exercises the *embedded* bundle): start the daemon → register a local artifact
// → the daemon serves it with the panel injected → draw + export → the panel POSTs
// the brief same-origin → the daemon fulfills the request → assert the brief.

const PORT = 8911;
const BASE = `http://127.0.0.1:${String(PORT)}`;
const BIN = path.resolve('cli/target/debug/share-the-mark');

const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Artifact</title></head>
<body><main><h1>Generated artifact</h1>
<button data-testid="primary-action" style="position:absolute;top:220px;left:160px;width:160px;height:44px">
Primary action</button></main></body></html>`;

let daemon: ChildProcess;
let artifactDir: string;

async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // daemon not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`daemon did not become healthy on ${BASE} within ${String(timeoutMs)}ms`);
}

test.beforeAll(async () => {
  artifactDir = mkdtempSync(path.join(tmpdir(), 'stm-artifact-'));
  writeFileSync(path.join(artifactDir, 'index.html'), FIXTURE);
  const dataDir = mkdtempSync(path.join(tmpdir(), 'stm-data-'));
  // Explicit `serve` runs until /shutdown (no idle timeout) on an isolated data dir.
  daemon = spawn(BIN, ['serve', '--port', String(PORT), '--dir', dataDir], { stdio: 'ignore' });
  await waitForHealth(15_000);
});

test.afterAll(async () => {
  try {
    await fetch(`${BASE}/shutdown`, { method: 'POST' });
  } catch {
    // already gone
  }
  daemon.kill();
});

test('@cli the daemon serves a local artifact, injects the panel, and round-trips the brief', async ({
  page,
}) => {
  test.setTimeout(60_000); // first paint + html-to-image capture under load

  // Register the artifact (no bundlePath → the daemon serves its embedded bundle).
  const regRes = await fetch(`${BASE}/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ artifactDir, entry: 'index.html' }),
  });
  const reg = (await regRes.json()) as { id: string; openUrl: string };
  expect(reg.openUrl).toBe(`${BASE}/artifact/${reg.id}/index.html`);

  // The served page self-mounts the panel (the embedded bundle, injected by the daemon).
  await page.goto(reg.openUrl);
  await page.locator('.stm-panel__export').waitFor({ state: 'visible' });

  // Draw a callout with a real click (default tool), then export — the panel POSTs
  // the brief to /brief same-origin (loopback → loopback).
  const box = await page.locator('[data-testid="primary-action"]').boundingBox();
  expect(box).not.toBeNull();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('.stm-panel__export').click();

  // The daemon fulfills the request by the artifact id parsed from the brief URL.
  await expect
    .poll(
      async () => {
        const statusRes = await fetch(`${BASE}/request/${reg.id}`);
        const body = (await statusRes.json()) as {
          status: string;
          brief?: { markdown?: string };
        };
        return body.status === 'fulfilled' ? (body.brief?.markdown ?? '') : '';
      },
      { timeout: 30_000 },
    )
    .toContain('Element: `[data-testid="primary-action"]`');
});
