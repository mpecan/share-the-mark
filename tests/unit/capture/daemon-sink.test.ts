import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DaemonSink } from '@/src/capture/daemon-sink';
import { sendMessage } from '@/src/messaging';
import type { ExportPayload } from '@/src/core/export';

vi.mock('@/src/messaging', () => ({ sendMessage: vi.fn() }));

const send = vi.mocked(sendMessage);

function payload(): ExportPayload {
  return {
    markdown: '# Brief',
    image: new Blob([new Uint8Array([80, 78, 71])], { type: 'image/png' }), // "PNG"
    meta: { url: 'https://x.test/p', title: 'X', capturedAt: 5 },
  };
}

describe('DaemonSink', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('reports availability via the daemonHealth message', async () => {
    send.mockResolvedValue(true);
    await expect(new DaemonSink().isAvailable()).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith('daemonHealth', undefined);
  });

  it('sends the brief (base64 image) and returns the daemon id', async () => {
    send.mockResolvedValue({ id: 'ab12' });
    const result = await new DaemonSink().write(payload());
    expect(result).toEqual({ ref: 'ab12' });
    expect(send).toHaveBeenCalledWith('sendBrief', {
      markdown: '# Brief',
      meta: { url: 'https://x.test/p', title: 'X', capturedAt: 5 },
      imageBase64: 'UE5H', // btoa("PNG")
    });
  });
});
