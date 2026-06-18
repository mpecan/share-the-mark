import { registerCaptureHandler } from '@/src/capture';
import { onMessage } from '@/src/messaging';

// The local `share-the-mark` daemon's loopback address (its default port). Briefs are POSTed
// here from the background service worker, which holds the host permission and
// fetches free of any page CSP.
const DAEMON_BASE = 'http://127.0.0.1:8787';

export default defineBackground(() => {
  // The `captureVisibleTab` round-trip (SPEC §5.6/§5.8) — the only message that
  // must reach the background, since `tabs.captureVisibleTab` is unavailable in
  // content scripts. The MV3 service worker is ephemeral: these handlers hold no
  // state, so re-registration on each wake is safe.
  registerCaptureHandler();

  // Content scripts ask the background for their own tab id (for per-tab
  // changelog persistence), which only the message sender exposes.
  onMessage('getTabId', ({ sender }) => sender.tab?.id ?? -1);

  // M2 daemon bridge: the "Send to agent" sink runs here so the loopback fetch
  // uses the extension's host permission and avoids page CSP.
  onMessage('daemonHealth', async () => {
    try {
      const res = await fetch(`${DAEMON_BASE}/health`);
      return res.ok;
    } catch {
      return false;
    }
  });

  onMessage('sendBrief', async ({ data }) => {
    const res = await fetch(`${DAEMON_BASE}/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`daemon responded ${String(res.status)}`);
    return (await res.json()) as { id: string };
  });
});
