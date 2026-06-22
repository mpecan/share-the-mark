import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitBrief } from '@/src/embed/local-submit';
import type { ExportPayload } from '@/src/core/export';

// Channel C (SPEC §13.6): submitBrief reshapes the export to the daemon's BriefIn
// contract and POSTs it same-origin to /brief. The IIFE boot (local.ts) is
// coverage-excluded glue; this is where the POST logic is covered.

function payload(): ExportPayload {
  return {
    markdown: '# Change brief — Local',
    image: new Blob(['PNGDATA'], { type: 'image/png' }),
    meta: { url: 'http://127.0.0.1:8787/artifact/x/index.html', title: 'Local', capturedAt: 0 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('submitBrief', () => {
  it('POSTs the reshaped brief to /brief using the global fetch by default', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    await submitBrief(payload());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/brief');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string) as {
      markdown: string;
      meta: { url: string; title: string; capturedAt: number };
      imageBase64: string;
    };
    expect(body.markdown).toContain('# Change brief');
    expect(body.meta.url).toContain('/artifact/x/');
    // base64 of "PNGDATA", with no `data:` prefix.
    expect(body.imageBase64).toBe('UE5HREFUQQ==');
  });

  it('throws when the daemon responds with a non-ok status', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 500 })));
    await expect(submitBrief(payload(), fetchMock)).rejects.toThrow(/500/);
  });
});
