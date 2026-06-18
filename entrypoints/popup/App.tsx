import { browser } from 'wxt/browser';
import { sendMessage } from '@/src/messaging';

// Popup UI (SPEC §5.8): toggle annotation mode on the active tab and open the
// options page. Annotation messages target the active tab's content script.
async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function activate(): Promise<void> {
  const tabId = await activeTabId();
  if (tabId !== undefined) await sendMessage('activateAnnotationMode', undefined, tabId);
  window.close();
}

async function deactivate(): Promise<void> {
  const tabId = await activeTabId();
  if (tabId !== undefined) await sendMessage('deactivateAnnotationMode', undefined, tabId);
  window.close();
}

export default function App() {
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
