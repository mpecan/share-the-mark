import type { ExportPayload, ExportSink } from '@/src/core/export';

// The single M1 export sink (SPEC §5.4). Writes one ClipboardItem carrying both
// the Markdown (text/plain) and the composited PNG (image/png). Must run in the
// content-script context under a user gesture — service workers cannot touch
// navigator.clipboard.
export class ClipboardSink implements ExportSink {
  readonly id = 'clipboard';

  isAvailable(): Promise<boolean> {
    return Promise.resolve(
      typeof navigator !== 'undefined' &&
        'clipboard' in navigator &&
        typeof ClipboardItem !== 'undefined',
    );
  }

  async write(payload: ExportPayload): Promise<void> {
    const item = new ClipboardItem({
      'text/plain': new Blob([payload.markdown], { type: 'text/plain' }),
      'image/png': payload.image,
    });
    await navigator.clipboard.write([item]);
  }
}
