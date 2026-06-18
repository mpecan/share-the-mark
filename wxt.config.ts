import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html and SPEC §6/§9.
// One MV3 source for all Chromium targets and Firefox; least-privilege
// permissions (`tabs.captureVisibleTab` works under `activeTab` + a user
// gesture, so no web-origin host_permissions).
//
// M2 adds one loopback host permission so the background service worker can POST
// briefs to the local `share-the-mark` daemon (the "Send to agent" sink). It is
// declared *optional* and requested at runtime from the Options page, so the
// default install carries zero host permissions — preserving the least-privilege
// posture and keeping store review clean.
const DAEMON_ORIGIN = 'http://127.0.0.1/*';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Function form: optional host access and the AMO id are expressed differently
  // per target, and WXT does not translate `optional_host_permissions` to MV2.
  manifest: ({ manifestVersion }) => ({
    name: 'share-the-mark',
    description:
      'Annotate live web pages and export a Markdown changelog plus an annotated screenshot.',
    homepage_url: 'https://github.com/mpecan/share-the-mark',
    permissions: ['activeTab', 'scripting', 'storage'],
    // Opt-in localhost daemon access, requested at runtime from the Options page.
    // MV3 carries hosts in `optional_host_permissions`; MV2 (Firefox) carries
    // them in `optional_permissions` alongside API permissions.
    ...(manifestVersion === 3
      ? { optional_host_permissions: [DAEMON_ORIGIN] }
      : {
          optional_permissions: [DAEMON_ORIGIN],
          // AMO requires a stable extension id.
          browser_specific_settings: { gecko: { id: 'share-the-mark@mpecan.dev' } },
        }),
  }),
});
