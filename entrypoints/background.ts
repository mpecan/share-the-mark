import { browser } from 'wxt/browser';
import { DAEMON_ORIGIN, registerCaptureHandler } from '@/src/capture';
import { onMessage, sendMessage } from '@/src/messaging';
import { loadPendingImport } from '@/src/storage';

// The local `share-the-mark` daemon's loopback address (its default port). Briefs are POSTed
// here from the background service worker, which holds the host permission and
// fetches free of any page CSP.
const DAEMON_BASE = 'http://127.0.0.1:8787';

// The built content-script file we inject on demand (it isn't in the manifest's
// `content_scripts` — see wxt.config.ts).
const CONTENT_SCRIPT = '/content-scripts/content.js';

// Inject the content script into a tab. No broad host permission is needed: the
// popup gesture grants `activeTab` for the current tab, and the import flow grants
// the shared origin. MV3 uses the scripting API; MV2 (Firefox) the legacy tabs API.
async function injectContentScript(tabId: number): Promise<void> {
  if (import.meta.env.MANIFEST_VERSION === 3) {
    await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
  } else {
    await browser.tabs.executeScript(tabId, { file: CONTENT_SCRIPT });
  }
}

// Inject, swallowing a missing-permission error (the user then places the marks
// with a toolbar click). Never rejects, so callers can fire it without handling.
async function injectQuietly(tabId: number): Promise<void> {
  try {
    await injectContentScript(tabId);
  } catch {
    // No host permission for this origin yet.
  }
}

// The import is triggered two ways (the popup message and the permissions.onAdded
// event) that fire near-simultaneously; this dedups them within one worker lifetime
// so the shared URL opens exactly once.
const recentlyOpened = new Set<string>();

// Open a shared-mark URL and inject the content script once the page is ready, so
// the stashed brief (claimPendingImport) resolves its anchors against a loaded DOM.
// Event-driven (no awaited promise spanning the load) so it survives the ephemeral
// MV3 service worker — `tabs.onUpdated` wakes the worker back up to inject.
async function openAndInject(url: string): Promise<void> {
  if (recentlyOpened.has(url)) return;
  recentlyOpened.add(url);
  setTimeout(() => recentlyOpened.delete(url), 5000);
  const tab = await browser.tabs.create({ url, active: true });
  const tabId = tab.id;
  if (tabId === undefined) return;
  const inject = (id: number, info: { status?: string }): void => {
    if (id !== tabId || info.status !== 'complete') return;
    browser.tabs.onUpdated.removeListener(inject);
    void injectQuietly(tabId);
  };
  if (tab.status === 'complete') void injectQuietly(tabId);
  else browser.tabs.onUpdated.addListener(inject);
}

export default defineBackground(() => {
  // The `captureVisibleTab` round-trip (SPEC §5.6/§5.8) — the only message that
  // must reach the background, since `tabs.captureVisibleTab` is unavailable in
  // content scripts. The MV3 service worker is ephemeral: these handlers hold no
  // state, so re-registration on each wake is safe.
  registerCaptureHandler();

  // Content scripts ask the background for their own tab id (for per-tab
  // changelog persistence), which only the message sender exposes.
  onMessage('getTabId', ({ sender }) => sender.tab?.id ?? -1);

  // Activation under activeTab: if the script is already running, re-mount it via a
  // message; otherwise inject it (it auto-mounts). The popup gesture grants the
  // activeTab access this injection needs.
  onMessage('ensureActive', async ({ data: tabId }) => {
    try {
      await sendMessage('activateAnnotationMode', undefined, tabId);
    } catch {
      await injectContentScript(tabId);
    }
  });

  // Cross-machine import (SPEC §12): the popup sends this once the shared origin is
  // already permitted (or in e2e). Open the URL and render the stashed brief.
  onMessage('openSharedImport', ({ data: { url } }) => openAndInject(url));

  // Panel setup CTAs (SPEC §11.2): content scripts can't open the Options page
  // themselves, so they route through the background.
  onMessage('openOptions', () => {
    void browser.runtime.openOptionsPage();
  });

  // The robust grant path: when the user allows access to the shared site, open it
  // right away — even if the popup closed while the permission prompt had focus, so
  // they never have to paste the link a second time.
  browser.permissions.onAdded.addListener((permissions) => {
    void (async () => {
      const origins = permissions.origins ?? [];
      if (origins.length === 0) return;
      const pending = await loadPendingImport();
      if (!pending) return;
      const origin = `${new URL(pending.brief.url).origin}/*`;
      if (origins.includes(origin)) await openAndInject(pending.brief.url);
    })();
  });

  // The loopback host permission is optional and granted from the Options page;
  // the content script checks here before attempting a daemon fetch so it can
  // point the user at Options instead of mislabelling it "daemon unreachable".
  onMessage('daemonPermitted', () => browser.permissions.contains({ origins: [DAEMON_ORIGIN] }));

  // M2 daemon bridge: the "Send to agent" sink runs here so the loopback fetch
  // uses the extension's host permission and avoids page CSP.
  onMessage('daemonHealth', async () => {
    try {
      const res = await fetch(`${DAEMON_BASE}/health`);
      if (!res.ok) return { reachable: false };
      const body = (await res.json()) as { version?: string; minExtension?: string };
      return { reachable: true, version: body.version, minExtension: body.minExtension };
    } catch {
      return { reachable: false };
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
