import { browser } from 'wxt/browser';
import { sendMessage } from '@/src/messaging';
import './App.css';

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
      <h1>share the mark</h1>
      <div className="popup__actions">
        <button type="button" onClick={() => void activate()}>
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
