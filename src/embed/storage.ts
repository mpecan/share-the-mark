import type { Changelog } from '@/src/core/model';
import type { StorageAdapter } from './ports';

// Default `StorageAdapter` implementations for the non-extension channels. The
// in-memory one is the `mount()` default (state lives for the page's lifetime);
// the localStorage one persists the changelog across reloads. Neither has a
// pending-import writer — the cross-machine import flow (SPEC §12) is
// extension-only — so `pendingImport.load` is always null off-extension.

const NO_PENDING_IMPORT = {
  load: () => Promise.resolve(null),
  clear: () => Promise.resolve(),
} as const;

/** State for the page's lifetime only — lost on reload. The `mount()` default. */
export function createInMemoryStorage(): StorageAdapter {
  const changelogs = new Map<string, Changelog>();
  return {
    changelog: {
      load: (url) => Promise.resolve(changelogs.get(url) ?? null),
      save: (changelog) => {
        changelogs.set(changelog.url, changelog);
        return Promise.resolve();
      },
    },
    pendingImport: NO_PENDING_IMPORT,
  };
}

/** Persists the changelog in `localStorage`, keyed by URL, so marks survive a
 * reload. Opt in with `mount({ storage: createLocalStorageStorage() })`. */
export function createLocalStorageStorage(prefix = 'stm'): StorageAdapter {
  const key = (url: string): string => `${prefix}:changelog:${url}`;
  return {
    changelog: {
      load: (url) => {
        const raw = localStorage.getItem(key(url));
        if (raw === null) return Promise.resolve(null);
        try {
          return Promise.resolve(JSON.parse(raw) as Changelog);
        } catch {
          // Corrupt entry — treat as empty rather than crashing the mount.
          return Promise.resolve(null);
        }
      },
      save: (changelog) => {
        localStorage.setItem(key(changelog.url), JSON.stringify(changelog));
        return Promise.resolve();
      },
    },
    pendingImport: NO_PENDING_IMPORT,
  };
}
