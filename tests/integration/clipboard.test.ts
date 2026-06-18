import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardSink } from '@/src/capture';
import type { ExportPayload } from '@/src/core/export';

const ctorArgs: Record<string, Blob>[] = [];

class FakeClipboardItem {
  readonly types: string[];
  constructor(data: Record<string, Blob>) {
    this.types = Object.keys(data);
    ctorArgs.push(data);
  }
}

const write = vi.fn<(items: unknown[]) => Promise<void>>().mockResolvedValue(undefined);

function payload(): ExportPayload {
  return {
    markdown: '# Change brief',
    image: new Blob(['img'], { type: 'image/png' }),
    meta: { url: 'https://x', title: 'X', capturedAt: 0 },
  };
}

beforeEach(() => {
  ctorArgs.length = 0;
  write.mockClear();
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClipboardSink', () => {
  it('reports availability when the clipboard APIs exist', async () => {
    await expect(new ClipboardSink().isAvailable()).resolves.toBe(true);
  });

  it('reports unavailable without ClipboardItem', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    await expect(new ClipboardSink().isAvailable()).resolves.toBe(false);
  });

  it('writes one ClipboardItem carrying both Markdown and PNG', async () => {
    await new ClipboardSink().write(payload());

    expect(write).toHaveBeenCalledTimes(1);
    expect(ctorArgs).toHaveLength(1);
    const data = ctorArgs[0];
    expect(data?.['text/plain']).toBeInstanceOf(Blob);
    expect(data?.['image/png']).toBeInstanceOf(Blob);
    expect(data?.['text/plain']?.type).toBe('text/plain');
  });
});
