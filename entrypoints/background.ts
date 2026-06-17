import { registerCaptureHandler } from '@/src/capture';

export default defineBackground(() => {
  // The `captureVisibleTab` round-trip (SPEC §5.6/§5.8) — the only message that
  // must reach the background, since `tabs.captureVisibleTab` is unavailable in
  // content scripts. The MV3 service worker is ephemeral: this handler holds no
  // state, so re-registration on each wake is safe.
  registerCaptureHandler();
});
