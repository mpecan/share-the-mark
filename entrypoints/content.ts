import { browser } from 'wxt/browser';
import { onMessage, sendMessage } from '@/src/messaging';
import { capturePage, createAnnotationSession, type HostAdapters } from '@/src/embed';
import {
  clearPendingImport,
  getSettings,
  loadChangelog,
  loadPendingImport,
  saveChangelog,
} from '@/src/storage';
import { ClipboardSink, DaemonSink, requestScreenshot } from '@/src/capture';
import '@/src/panel/panel.css';

// Thin extension shell over the browser-free annotation session (SPEC §13.2). This
// file owns only the genuinely extension-bound concerns: the injection guard, the
// WXT shadow-root lifecycle, the message bus, and building the `HostAdapters` that
// wrap `browser.*` / storage / messaging. All orchestration lives in `src/embed`.
//
// Injected on demand under `activeTab` (no broad host permission) — see
// entrypoints/background.ts. `registration: 'runtime'` keeps the script out of the
// manifest's `content_scripts`, so the install requests no host access. The e2e
// build re-adds a static, fixture-scoped registration in the wxt.config hook (since
// headless Chromium can't gesture-grant activeTab).
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // The background injects on demand and may hit a tab that already ran the
    // script (e.g. the import path), so guard against a double mount. Kept before
    // session creation so a racing injection can't double-claim the import slot.
    if (document.documentElement.dataset['stmInjected'] === 'true') return;
    document.documentElement.dataset['stmInjected'] = 'true';

    // Content scripts can't read their own tab id; the background supplies it. Bind
    // the changelog port to it here so the session never handles a tab id.
    const tabId = await sendMessage('getTabId', undefined);

    const adapters: HostAdapters = {
      getSettings,
      changelog: {
        load: (url) => loadChangelog(tabId, url),
        save: (changelog) => saveChangelog(tabId, changelog),
      },
      pendingImport: { load: loadPendingImport, clear: clearPendingImport },
      // Capture mode is a user setting (read fresh each export so a toggle takes
      // effect without re-injecting). `viewport` is the high-fidelity
      // `captureVisibleTab` raster (image top-left = viewport → zero offset);
      // `fullPage` re-renders the whole document via html-to-image (image top-left
      // = document origin → scroll offset), trading fidelity for full context.
      captureScreenshot: async () => {
        const { captureMode } = await getSettings();
        if (captureMode === 'fullPage') return capturePage();
        return { dataUrl: await requestScreenshot(), offset: { x: 0, y: 0 } };
      },
      clipboard: { writeText: (text) => navigator.clipboard.writeText(text) },
      exportSink: new ClipboardSink(),
      daemon: {
        permitted: () => sendMessage('daemonPermitted', undefined),
        health: () => sendMessage('daemonHealth', undefined),
        sink: new DaemonSink(),
      },
      getVersion: () => browser.runtime.getManifest().version,
      openOptions: () => {
        void sendMessage('openOptions', undefined);
      },
    };

    const session = await createAnnotationSession(adapters);

    const ui = await createShadowRootUi(ctx, {
      name: 'share-the-mark',
      position: 'overlay',
      anchor: 'body',
      append: 'last',
      mode: 'closed',
      onMount: (container) => {
        session.mountView(container);
      },
      onRemove: () => {
        session.unmountView();
      },
    });

    // Mark our shadow-root host so the full-page `capturePage` (html-to-image)
    // doesn't bake the overlay/panel into the screenshot — the same `[data-stm-embed]`
    // exclusion the embed channels use. (The closed shadow root already hides the UI's
    // contents from html-to-image; this also drops the host box itself.)
    ui.shadowHost.dataset['stmEmbed'] = 'true';

    // Injecting the content script *is* the activation — mount immediately. (Re-
    // activation after Stop goes through the activateAnnotationMode message below.)
    ui.mount();

    onMessage('activateAnnotationMode', () => {
      ui.mount();
    });
    onMessage('deactivateAnnotationMode', () => {
      ui.remove();
    });
    onMessage('exportAnnotations', () => {
      void session.exportAnnotations();
    });

    // Signals (for e2e) that the message listeners above are registered.
    document.documentElement.dataset['stmReady'] = 'true';
  },
});
