import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, getSettings, saveSettings, type Settings } from '@/src/storage';
import type { ThemeMode } from '@/src/storage/settings-defaults';
import { DAEMON_ORIGIN } from '@/src/capture';
import { CLI_INSTALL, HUB_URL } from '@/src/core/links';
import { applyDocumentTheme } from '@/src/theme/apply-theme';
import type { ToolKind } from '@/src/core/model';

// Options page (SPEC §5.8): default tool, stroke defaults, and Markdown
// extraction preferences, persisted to storage.local.
const TOOLS: ToolKind[] = ['select', 'callout', 'text', 'arrow', 'highlight', 'element'];
const THEMES: ThemeMode[] = ['auto', 'light', 'dark'];

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Whether the optional loopback host permission (the agent daemon) is granted.
  const [isAgentEnabled, setIsAgentEnabled] = useState(false);
  // The CLI install command most recently copied, for inline feedback.
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setSettings(await getSettings());
      setIsAgentEnabled(await browser.permissions.contains({ origins: [DAEMON_ORIGIN] }));
    })();
  }, []);

  // Reflect the chosen theme on this page as it changes (initial load + edits).
  useEffect(() => {
    applyDocumentTheme(settings.theme);
  }, [settings.theme]);

  // Grant/revoke must run from this user gesture — permissions.request can't be
  // called from the in-page panel (content scripts can't prompt for permissions).
  function toggleAgent(shouldEnable: boolean): void {
    void (async () => {
      const isGranted = shouldEnable
        ? await browser.permissions.request({ origins: [DAEMON_ORIGIN] })
        : !(await browser.permissions.remove({ origins: [DAEMON_ORIGIN] }));
      setIsAgentEnabled(isGranted);
    })();
  }

  function copyCommand(command: string): void {
    void (async () => {
      try {
        await navigator.clipboard.writeText(command);
        setCopiedCommand(command);
      } catch {
        // Clipboard may be unavailable; the command stays visible to copy by hand.
      }
    })();
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setSettings((prev) => {
      const next: Settings = { ...prev, [key]: value };
      void saveSettings(next);
      return next;
    });
  }

  return (
    <main className="options">
      <header className="options__head">
        <h1 className="brand">share&nbsp;the&nbsp;mark</h1>
        <span className="options__sub">options</span>
      </header>

      <div className="options__grid">
        <label className="options__field">
          <span>Theme</span>
          <select
            value={settings.theme}
            onChange={(e) => {
              update('theme', e.target.value as ThemeMode);
            }}
          >
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {theme === 'auto' ? 'Auto (match system)' : theme}
              </option>
            ))}
          </select>
        </label>

        <label className="options__field">
          <span>Default tool</span>
          <select
            value={settings.defaultTool}
            onChange={(e) => {
              update('defaultTool', e.target.value as ToolKind);
            }}
          >
            {TOOLS.map((tool) => (
              <option key={tool} value={tool}>
                {tool}
              </option>
            ))}
          </select>
        </label>

        <label className="options__field">
          <span>Stroke color</span>
          <input
            type="color"
            value={settings.strokeColor}
            onChange={(e) => {
              update('strokeColor', e.target.value);
            }}
          />
        </label>

        <label className="options__field">
          <span>Stroke width</span>
          <input
            type="number"
            min={1}
            max={32}
            value={settings.strokeWidth}
            onChange={(e) => {
              update('strokeWidth', Number(e.target.value));
            }}
          />
        </label>

        <label className="options__field">
          <span>Highlight color</span>
          <input
            type="color"
            value={settings.highlightColor}
            onChange={(e) => {
              update('highlightColor', e.target.value);
            }}
          />
        </label>

        <label className="options__field">
          <span>Markdown: extra selectors to strip (one per line)</span>
          <textarea
            value={settings.markdownStrip.join('\n')}
            onChange={(e) => {
              update(
                'markdownStrip',
                e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              );
            }}
          />
        </label>
      </div>

      <section className="options__section">
        <label className="options__toggle">
          <input
            type="checkbox"
            checked={isAgentEnabled}
            onChange={(e) => {
              toggleAgent(e.target.checked);
            }}
          />
          <span>
            <strong>Agent integration</strong>
            <small>
              Allow “Send to agent” to reach the local <code>share-the-mark</code> daemon on
              127.0.0.1. Off by default — nothing leaves your machine until you enable it.
            </small>
          </span>
        </label>
      </section>

      <section className="options__section options__cli">
        <strong>Install the CLI</strong>
        <small>
          “Send to agent” talks to a tiny local daemon — the <code>share-the-mark</code> CLI.
          Install it, then run <code>share-the-mark serve</code>.
        </small>
        <ul className="options__cli-list">
          {CLI_INSTALL.map(({ label, command }) => (
            <li key={label} className="options__cli-row">
              <span className="options__cli-tag">{label}</span>
              <code>{command}</code>
              <button
                type="button"
                className="options__cli-copy"
                onClick={() => {
                  copyCommand(command);
                }}
              >
                {copiedCommand === command ? 'Copied' : 'Copy'}
              </button>
            </li>
          ))}
        </ul>
        <a className="options__cli-link" href={HUB_URL} target="_blank" rel="noreferrer">
          Get the extension &amp; docs ↗
        </a>
      </section>
    </main>
  );
}
