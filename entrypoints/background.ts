export default defineBackground(() => {
  // M1: handle the `captureVisibleTab` message (SPEC §5.6, §5.8) — the only
  // round-trip to the background, since `tabs.captureVisibleTab` is unavailable
  // in content scripts. Treat the MV3 service worker as ephemeral: hold no
  // in-memory state across invocations; rehydrate from storage.
});
