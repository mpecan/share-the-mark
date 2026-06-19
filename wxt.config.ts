import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html and SPEC §6/§9.
// One MV3 source for all Chromium targets and Firefox. The content script is
// injected on demand under `activeTab` (registration: 'runtime' in content.ts), so
// the install requests NO host access — no "read and change all your data on all
// websites" warning. `tabs.captureVisibleTab` and injection both work under
// `activeTab` + a user gesture.
//
// Two host patterns are declared *optional* (warning-free at install, prompted at
// runtime): the loopback daemon (M2 "Send to agent", granted from Options) and
// `<all_urls>` (M4 share-import requests the single shared origin when the user
// opens a shared mark).
const DAEMON_ORIGIN = 'http://127.0.0.1/*';
const ALL_URLS = '<all_urls>';
const OPTIONAL_HOSTS = [DAEMON_ORIGIN, ALL_URLS];

const withoutAllUrls = (list: string[] | undefined): string[] | undefined =>
  list?.filter((permission) => permission !== ALL_URLS);

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
    // Opt-in hosts, requested at runtime (no install warning). MV3 carries hosts in
    // `optional_host_permissions`; MV2 (Firefox) carries them in `optional_permissions`.
    ...(manifestVersion === 3
      ? { optional_host_permissions: OPTIONAL_HOSTS }
      : {
          optional_permissions: OPTIONAL_HOSTS,
          // AMO requires a stable extension id.
          browser_specific_settings: { gecko: { id: 'share-the-mark@mpecan.dev' } },
        }),
  }),
  hooks: {
    // `registration: 'runtime'` (content.ts) keeps the script out of `content_scripts`,
    // but WXT moves its `matches` into `host_permissions` (MV3) / `permissions` (MV2).
    // Strip `<all_urls>` back out so the install grants no broad host access — we
    // inject under `activeTab` instead.
    //
    // Exception: the e2e build keeps the broad host grant, because headless Chromium
    // can't gesture-grant `activeTab`, so the test harness injects the content script
    // from the service worker (which needs host access). The shipped build is always
    // `production`, so this never reaches users (and `check:perms` guards it).
    'build:manifestGenerated'(wxt, manifest) {
      if (wxt.config.mode === 'e2e') return;
      manifest.host_permissions = withoutAllUrls(manifest.host_permissions);
      if (manifest.permissions)
        manifest.permissions = withoutAllUrls(manifest.permissions) as typeof manifest.permissions;
    },
  },
  // The Firefox sources zip (for AMO review) doesn't honour .gitignore, so trim
  // build artifacts and other non-source output explicitly. Keep `cli/src` (the
  // daemon is open) but drop its compiled `target`.
  zip: {
    excludeSources: [
      'cli/target/**',
      'coverage/**',
      '**/*.tsbuildinfo',
      '**/*.log',
      '.tmp-render/**',
    ],
  },
});
