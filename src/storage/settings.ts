import { storage } from 'wxt/utils/storage';
import { DEFAULT_SETTINGS, type Settings } from './settings-defaults';

// Typed settings persisted to storage.local — SPEC §5.7. No sync storage in M1.
// The `Settings` shape + `DEFAULT_SETTINGS` live in `settings-defaults.ts` (browser-
// free) so the embed can reuse them without pulling WXT; re-exported here.
export { DEFAULT_SETTINGS, type Settings } from './settings-defaults';

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
