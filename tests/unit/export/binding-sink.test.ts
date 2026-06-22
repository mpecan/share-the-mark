import { describe, expect, it, vi } from 'vitest';
import { BindingSink } from '@/src/core/export';
import type { ExportPayload } from '@/src/core/export';

// SPEC §13.3 — the callback-delegating ExportSink for the non-extension channels.

function payload(): ExportPayload {
  return {
    markdown: '# Change brief — doc',
    image: new Blob(['png'], { type: 'image/png' }),
    meta: { url: 'https://example.com', title: 'doc', capturedAt: 0 },
  };
}

describe('BindingSink', () => {
  it('reports itself as available', async () => {
    const sink = new BindingSink(() => Promise.resolve());
    expect(sink.id).toBe('binding');
    await expect(sink.isAvailable()).resolves.toBe(true);
  });

  it('delegates the write to the injected callback and resolves an empty result', async () => {
    const deliver = vi.fn<(p: ExportPayload) => Promise<void>>(() => Promise.resolve());
    const sink = new BindingSink(deliver);
    const p = payload();

    await expect(sink.write(p)).resolves.toEqual({});
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(p);
  });

  it('propagates a callback rejection', async () => {
    const sink = new BindingSink(() => Promise.reject(new Error('binding gone')));
    await expect(sink.write(payload())).rejects.toThrow('binding gone');
  });
});
