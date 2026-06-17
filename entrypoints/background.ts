import { registerCaptureHandler } from '@/src/capture';
import { onMessage } from '@/src/messaging';

export default defineBackground(() => {
  // The `captureVisibleTab` round-trip (SPEC §5.6/§5.8) — the only message that
  // must reach the background, since `tabs.captureVisibleTab` is unavailable in
  // content scripts. The MV3 service worker is ephemeral: these handlers hold no
  // state, so re-registration on each wake is safe.
  registerCaptureHandler();

  // Content scripts ask the background for their own tab id (for per-tab
  // changelog persistence), which only the message sender exposes.
  onMessage('getTabId', ({ sender }) => sender.tab?.id ?? -1);
});
