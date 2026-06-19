import { storage } from 'wxt/utils/storage';
import type { Changelog } from '@/src/core/model';

// The current changelog is persisted per tab + URL so a reload doesn't lose
// work — SPEC §5.7.

type ChangelogKey = `local:${string}`;

// v4: callout/text/arrow share one point-anchored shape — an arrow now stores a
// single anchor point (`offset`, the head) plus a head-relative `tail`, replacing
// the old box-relative `from`/`to`. Bumping the key discards data with the old shape.
function changelogKey(tabId: number, url: string): ChangelogKey {
  return `local:changelog:v4:${String(tabId)}:${url}`;
}

export function saveChangelog(tabId: number, changelog: Changelog): Promise<void> {
  return storage.setItem(changelogKey(tabId, changelog.url), changelog);
}

export function loadChangelog(tabId: number, url: string): Promise<Changelog | null> {
  return storage.getItem<Changelog>(changelogKey(tabId, url));
}

export function clearChangelog(tabId: number, url: string): Promise<void> {
  return storage.removeItem(changelogKey(tabId, url));
}
