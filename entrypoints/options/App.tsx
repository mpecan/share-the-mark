import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, getSettings, saveSettings, type Settings } from '@/src/storage';
import type { ToolKind } from '@/src/core/model';

// Options page (SPEC §5.8): default tool, stroke defaults, and Markdown
// extraction preferences, persisted to storage.local.
const TOOLS: ToolKind[] = ['select', 'callout', 'text', 'arrow', 'highlight', 'element'];

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    void (async () => {
      setSettings(await getSettings());
    })();
  }, []);

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
    </main>
  );
}
