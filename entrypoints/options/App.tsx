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
      <h1>share the mark — options</h1>

      <label>
        Default tool
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

      <label>
        Stroke color
        <input
          type="color"
          value={settings.strokeColor}
          onChange={(e) => {
            update('strokeColor', e.target.value);
          }}
        />
      </label>

      <label>
        Stroke width
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

      <label>
        Highlight color
        <input
          type="color"
          value={settings.highlightColor}
          onChange={(e) => {
            update('highlightColor', e.target.value);
          }}
        />
      </label>

      <label>
        Markdown: extra selectors to strip (one per line)
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
    </main>
  );
}
