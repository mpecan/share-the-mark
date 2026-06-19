import { useState, type JSX } from 'react';
import { browser } from 'wxt/browser';
import { sendMessage } from '@/src/messaging';
import { decodeToken } from '@/src/share';
import { savePendingImport } from '@/src/storage';
import type { ShareBrief, ShareError } from '@/src/core/share';

// Popup UI (SPEC §5.8): activate annotation mode on the active tab, open the options
// page, and import a cross-machine share link (SPEC §12). The content script is
// injected on demand under `activeTab` (no broad host permission) — the background
// does the injection; the popup just supplies the active tab id.
async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function activate(): Promise<void> {
  const tabId = await activeTabId();
  if (tabId !== undefined) await sendMessage('ensureActive', tabId);
  window.close();
}

async function deactivate(): Promise<void> {
  const tabId = await activeTabId();
  if (tabId !== undefined) {
    try {
      await sendMessage('deactivateAnnotationMode', undefined, tabId);
    } catch {
      // Harmless if the script isn't running on this tab — no receiver.
    }
  }
  window.close();
}

const IMPORT_ERROR: Record<ShareError, string> = {
  malformed: "That doesn't look like a share link.",
  version: 'This share link needs a newer version of the extension.',
  url: 'This share link points at an invalid page address.',
  'too-large': 'This share link is too large to open.',
  integrity: 'This share link looks corrupted — try copying it again.',
};

// Skip the per-origin permission prompt in the e2e build (headless can't grant);
// the e2e build keeps a broad host grant so injection works without it.
const IS_E2E = import.meta.env.MODE === 'e2e';

// Open a shared mark: decode the pasted token, request access to the shared site so
// its tab can render the marks, stash the brief, and let the background open + inject
// it (see openSharedImport / claimPendingImport). The brief travels through storage,
// not the URL, so it survives the navigation.
function ImportSection(): JSX.Element {
  const [token, setToken] = useState('');
  const [brief, setBrief] = useState<ShareBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function inspect(value: string): Promise<void> {
    setToken(value);
    if (value.trim() === '') {
      setBrief(null);
      setError(null);
      return;
    }
    const result = await decodeToken(value);
    if (result.ok) {
      setBrief(result.brief);
      setError(null);
    } else {
      setBrief(null);
      setError(IMPORT_ERROR[result.reason]);
    }
  }

  async function openShared(target: ShareBrief): Promise<void> {
    const origin = `${new URL(target.url).origin}/*`;
    if (IS_E2E) {
      await savePendingImport({ brief: target, createdAt: Date.now() });
      await sendMessage('openSharedImport', { url: target.url });
      window.close();
      return;
    }
    // Stash the brief first (fire-and-forget keeps the click gesture intact for the
    // request), then ask for access to the shared site. On "Allow" the tab opens
    // immediately — the background opens it from the permissions.onAdded event, so it
    // works even if this popup closed while the prompt had focus (no second paste).
    // Already-granted origins resolve without a prompt; this popup opens it directly.
    void savePendingImport({ brief: target, createdAt: Date.now() });
    const isGranted = await browser.permissions.request({ origins: [origin] });
    if (!isGranted) {
      setError('Allow access to the site to place the shared marks.');
      return;
    }
    await sendMessage('openSharedImport', { url: target.url });
    window.close();
  }

  const count = brief?.annotations.length ?? 0;
  return (
    <section className="popup__import">
      <label className="popup__import-label" htmlFor="stm-token">
        Open a shared mark
      </label>
      <textarea
        id="stm-token"
        className="popup__token"
        rows={2}
        placeholder="Paste a share link (stm1:…)"
        value={token}
        onChange={(event) => void inspect(event.target.value)}
      />
      {error !== null && <p className="popup__import-error">{error}</p>}
      {brief !== null && (
        <button type="button" className="button--primary" onClick={() => void openShared(brief)}>
          Open &amp; place {count} mark{count === 1 ? '' : 's'}
        </button>
      )}
    </section>
  );
}

export default function App(): JSX.Element {
  return (
    <main className="popup">
      <header className="popup__head">
        <h1 className="brand">share&nbsp;the&nbsp;mark</h1>
      </header>
      <div className="popup__actions">
        <button type="button" className="button--primary" onClick={() => void activate()}>
          Start annotating
        </button>
        <button type="button" onClick={() => void deactivate()}>
          Stop
        </button>
      </div>
      <ImportSection />
      <button
        type="button"
        className="popup__link"
        onClick={() => void browser.runtime.openOptionsPage()}
      >
        Options
      </button>
    </main>
  );
}
