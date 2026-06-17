import { storage } from 'wxt/utils/storage';
import type { ToolKind } from '@/src/core/model';

// Typed settings persisted to storage.local — SPEC §5.7. No sync storage in M1.

export interface Settings {
  defaultTool: ToolKind;
  strokeColor: string;
  strokeWidth: number;
  highlightColor: string;
  /** Extra selectors stripped during Markdown extraction. */
  markdownStrip: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  defaultTool: 'callout',
  strokeColor: '#e11d48',
  strokeWidth: 3,
  highlightColor: '#fde047',
  markdownStrip: [],
};

const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export function getSettings(): Promise<Settings> {
  return settingsItem.getValue();
}

export function saveSettings(settings: Settings): Promise<void> {
  return settingsItem.setValue(settings);
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => {
    callback(value);
  });
}
