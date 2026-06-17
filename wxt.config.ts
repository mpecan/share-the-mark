import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html and SPEC §6/§9.
// One MV3 source for all Chromium targets and Firefox; least-privilege
// permissions (no host_permissions — `tabs.captureVisibleTab` works under
// `activeTab` + a user gesture).
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'share-the-mark',
    description:
      'Annotate live web pages and export a Markdown changelog plus an annotated screenshot.',
    permissions: ['activeTab', 'scripting', 'storage'],
  },
});
