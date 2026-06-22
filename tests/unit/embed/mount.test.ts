import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { buildEmbedAdapters, mount, type MountOptions, type StmHandle } from '@/src/embed/mount';
import { DEFAULT_SETTINGS } from '@/src/storage/settings-defaults';
import type { Changelog } from '@/src/core/model';
import type { ExportPayload } from '@/src/core/export';
import { fakeCompositeDeps } from '../../fixtures/composite';

// Channel-shared mount() wrapper (SPEC §13.2). Covered here under happy-dom with
// injected canvas/screenshot/export fakes; the Playwright wiring lives in the
// (coverage-excluded) standalone.ts/playwright.ts glue and is exercised by e2e.

let active: StmHandle | null = null;

function opts(over: Partial<MountOptions> = {}): MountOptions {
  return {
    screenshot: () => Promise.resolve('data:image/png;base64,AAAA'),
    onExport: () => Promise.resolve(),
    compositeDeps: fakeCompositeDeps(),
    ...over,
  };
}

async function mountEmbed(over: Partial<MountOptions> = {}): Promise<StmHandle> {
  let handle!: StmHandle;
  await act(async () => {
    handle = await mount(opts(over));
  });
  active = handle;
  return handle;
}

afterEach(() => {
  active?.destroy();
  active = null;
  document.body.innerHTML = '';
});

describe('buildEmbedAdapters', () => {
  it('builds in-memory, daemon-less adapters', async () => {
    const adapters = buildEmbedAdapters(opts());

    await expect(adapters.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    await expect(adapters.pendingImport.load()).resolves.toBeNull();
    await expect(adapters.pendingImport.clear()).resolves.toBeUndefined();
    await expect(adapters.daemon.permitted()).resolves.toBe(false);
    await expect(adapters.daemon.health()).resolves.toEqual({ reachable: false });
    expect(adapters.getVersion()).toMatch(/embed/);
    adapters.openOptions(); // no-op off-extension
  });

  it('round-trips the changelog through the in-memory store', async () => {
    const adapters = buildEmbedAdapters(opts());
    const changelog: Changelog = {
      id: 'c',
      url: 'https://x.test/',
      title: 't',
      capturedAt: 0,
      annotations: [],
    };
    await expect(adapters.changelog.load(changelog.url)).resolves.toBeNull();
    await adapters.changelog.save(changelog);
    await expect(adapters.changelog.load(changelog.url)).resolves.toBe(changelog);
  });

  it('honours a settings override', async () => {
    const settings = { ...DEFAULT_SETTINGS, defaultTool: 'arrow' as const };
    const adapters = buildEmbedAdapters(opts({ settings }));
    await expect(adapters.getSettings()).resolves.toBe(settings);
  });

  it('writes the share link through navigator.clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await buildEmbedAdapters(opts()).clipboard.writeText('stm1:abc');
    expect(writeText).toHaveBeenCalledWith('stm1:abc');
  });
});

describe('mount', () => {
  it('renders the panel into an open shadow root', async () => {
    await mountEmbed();
    const host = document.querySelector<HTMLElement>('[data-stm-embed="true"]');
    expect(host?.shadowRoot?.querySelector('.stm-panel')).not.toBeNull();
  });

  it('threads panelActions through to the footer', async () => {
    await mountEmbed({
      panelActions: { exportLabel: 'Send to agent', showSendToAgent: false, showShareLink: false },
    });
    const shadow = document.querySelector<HTMLElement>('[data-stm-embed="true"]')?.shadowRoot;
    expect(shadow?.querySelector('.stm-panel__export')?.textContent).toBe('Send to agent');
    expect(shadow?.querySelector('.stm-panel__send')).toBeNull();
    expect(shadow?.querySelector('.stm-panel__share')).toBeNull();
  });

  it('injects the provided styles into the shadow root', async () => {
    await mountEmbed({ styles: '.stm-panel{color:red}' });
    const host = document.querySelector<HTMLElement>('[data-stm-embed="true"]');
    expect(host?.shadowRoot?.querySelector('style')?.textContent).toContain('color:red');
  });

  it('exports the composited payload through onExport', async () => {
    const onExport = vi.fn<(payload: ExportPayload) => Promise<void>>(() => Promise.resolve());
    const handle = await mountEmbed({ onExport });
    await act(async () => {
      await handle.exportNow();
    });
    expect(onExport).toHaveBeenCalledTimes(1);
    const payload = onExport.mock.calls[0]?.[0];
    expect(payload?.markdown).toContain('# Change brief');
    expect(payload?.image).toBeInstanceOf(Blob);
  });

  it('closes and re-opens the view', async () => {
    const handle = await mountEmbed();
    const host = document.querySelector<HTMLElement>('[data-stm-embed="true"]');
    act(() => {
      handle.close();
    });
    act(() => {
      handle.open();
    });
    expect(host?.shadowRoot?.querySelector('.stm-panel')).not.toBeNull();
  });

  it('removes the host element on destroy', async () => {
    const handle = await mountEmbed();
    expect(document.querySelector('[data-stm-embed="true"]')).not.toBeNull();
    act(() => {
      handle.destroy();
    });
    active = null;
    expect(document.querySelector('[data-stm-embed="true"]')).toBeNull();
  });
});
