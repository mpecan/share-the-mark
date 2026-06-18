import { sendMessage } from '@/src/messaging';
import type { ExportPayload, ExportResult, ExportSink } from '@/src/core/export';

// The loopback origin the daemon listens on. Declared as an *optional* host
// permission (see wxt.config.ts) and requested at runtime from the Options page,
// so the default install holds no host permissions. Match-pattern form for
// `permissions.{contains,request,remove}`.
export const DAEMON_ORIGIN = 'http://127.0.0.1/*';

// Export sink that ships the brief to the local `share-the-mark` daemon (SPEC §5.4, M2).
// The actual HTTP POST happens in the background service worker (which holds the
// host permission and isn't subject to page CSP); this sink just round-trips the
// payload over the typed message bus and returns the brief id for the handoff.
export class DaemonSink implements ExportSink {
  readonly id = 'daemon';

  isAvailable(): Promise<boolean> {
    return sendMessage('daemonHealth', undefined);
  }

  async write(payload: ExportPayload): Promise<ExportResult> {
    const imageBase64 = await blobToBase64(payload.image);
    const { id } = await sendMessage('sendBrief', {
      markdown: payload.markdown,
      meta: payload.meta,
      imageBase64,
    });
    return { ref: id };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      // readAsDataURL yields `data:<type>;base64,<payload>` — keep the payload.
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('failed to read image'));
    });
    reader.readAsDataURL(blob);
  });
}
