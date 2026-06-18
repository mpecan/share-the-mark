import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html and SPEC §6/§9.
// One MV3 source for all Chromium targets and Firefox; least-privilege
// permissions (`tabs.captureVisibleTab` works under `activeTab` + a user
// gesture, so no web-origin host_permissions).
//
// M2 adds one loopback host permission so the background service worker can POST
// briefs to the local `stm` daemon (the "Send to agent" sink). Scoped to
// 127.0.0.1 only — no web origins — preserving the least-privilege posture.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'share-the-mark',
    description:
      'Annotate live web pages and export a Markdown changelog plus an annotated screenshot.',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['http://127.0.0.1/*'],
  },
});
