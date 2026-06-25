import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryStorage, createLocalStorageStorage } from '@/src/embed/storage';
import type { Changelog } from '@/src/core/model';

const changelog: Changelog = {
  id: 'c',
  url: 'https://x.test/',
  title: 't',
  capturedAt: 0,
  annotations: [],
};

describe('createInMemoryStorage', () => {
  it('round-trips the changelog and reports no pending import', async () => {
    const store = createInMemoryStorage();
    await expect(store.changelog.load(changelog.url)).resolves.toBeNull();
    await store.changelog.save(changelog);
    await expect(store.changelog.load(changelog.url)).resolves.toBe(changelog);
    await expect(store.pendingImport.load()).resolves.toBeNull();
    await expect(store.pendingImport.clear()).resolves.toBeUndefined();
  });
});

describe('createLocalStorageStorage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('persists and reloads the changelog by URL', async () => {
    const store = createLocalStorageStorage();
    await expect(store.changelog.load(changelog.url)).resolves.toBeNull();
    await store.changelog.save(changelog);
    await expect(store.changelog.load(changelog.url)).resolves.toEqual(changelog);
  });

  it('treats a corrupt entry as empty', async () => {
    const store = createLocalStorageStorage();
    localStorage.setItem('stm:changelog:bad', '{not json');
    await expect(store.changelog.load('bad')).resolves.toBeNull();
  });

  it('honours a custom prefix and has no pending import', async () => {
    const store = createLocalStorageStorage('app');
    await store.changelog.save(changelog);
    expect(localStorage.getItem(`app:changelog:${changelog.url}`)).not.toBeNull();
    await expect(store.pendingImport.load()).resolves.toBeNull();
    await expect(store.pendingImport.clear()).resolves.toBeUndefined();
  });
});
