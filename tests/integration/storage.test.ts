import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  clearChangelog,
  clearPendingImport,
  getSettings,
  loadChangelog,
  loadPendingImport,
  savePendingImport,
  saveChangelog,
  saveSettings,
  watchSettings,
  type Settings,
} from '@/src/storage';
import { buildBrief } from '@/src/core/share';
import type { PendingImport } from '@/src/share';
import type { Changelog } from '@/src/core/model';

function sampleChangelog(url: string): Changelog {
  return { id: 'c1', url, title: 'T', capturedAt: 0, annotations: [] };
}

function samplePending(url: string): PendingImport {
  return { brief: buildBrief(sampleChangelog(url)), createdAt: 100 };
}

describe('settings storage', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', async () => {
    const next: Settings = { ...DEFAULT_SETTINGS, defaultTool: 'arrow', strokeWidth: 8 };
    await saveSettings(next);
    expect(await getSettings()).toEqual(next);
  });

  it('notifies watchers and can unwatch', async () => {
    const seen: Settings[] = [];
    const unwatch = watchSettings((s) => {
      seen.push(s);
    });
    expect(typeof unwatch).toBe('function');

    const next: Settings = { ...DEFAULT_SETTINGS, strokeColor: '#000000' };
    await saveSettings(next);
    expect(seen.at(-1)).toEqual(next);

    unwatch();
  });
});

describe('changelog storage', () => {
  it('returns null for an unknown tab/url', async () => {
    expect(await loadChangelog(1, 'https://x')).toBeNull();
  });

  it('round-trips a changelog keyed by tab and url', async () => {
    const changelog = sampleChangelog('https://a');
    await saveChangelog(7, changelog);
    expect(await loadChangelog(7, 'https://a')).toEqual(changelog);
    // Different tab is a different key.
    expect(await loadChangelog(8, 'https://a')).toBeNull();
  });

  it('clears a stored changelog', async () => {
    const changelog = sampleChangelog('https://b');
    await saveChangelog(3, changelog);
    await clearChangelog(3, 'https://b');
    expect(await loadChangelog(3, 'https://b')).toBeNull();
  });
});

describe('pending-import storage', () => {
  it('returns null when no import is pending', async () => {
    expect(await loadPendingImport()).toBeNull();
  });

  it('round-trips and clears a single pending slot', async () => {
    const pending = samplePending('https://a');
    await savePendingImport(pending);
    expect(await loadPendingImport()).toEqual(pending);
    await clearPendingImport();
    expect(await loadPendingImport()).toBeNull();
  });
});
