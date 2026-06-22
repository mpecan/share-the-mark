import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { createAnnotationSession, type AnnotationSession, type HostAdapters } from '@/src/embed';
import { buildBrief } from '@/src/core/share';
import { DEFAULT_SETTINGS } from '@/src/storage';
import type { CompositeDeps, CompositeSurface, DrawContext, LoadedImage } from '@/src/capture';
import type { Annotation, Changelog } from '@/src/core/model';
import {
  BindingSink,
  type ExportPayload,
  type ExportResult,
  type ExportSink,
} from '@/src/core/export';
import { targetFor } from './overlay-harness';

type WriteFn = (payload: ExportPayload) => Promise<ExportResult>;

// Integration coverage for the browser-free annotation session (SPEC §13.2). The
// orchestration lifted out of `entrypoints/content.ts` now lives under `src/embed`
// and so falls under the §8.4 coverage thresholds — these tests drive every branch
// through faked `HostAdapters` and the real overlay + panel (which render under
// happy-dom). A guard test pins the "no extension imports" invariant.

// An element mark is the simplest seed (no text anchor); its selector resolves to
// nothing in the test DOM, so it's an orphan for placement and yields an empty
// resolved set for compositing — exactly the cheap export path we want.
function seedAnnotation(): Annotation {
  return {
    id: 'seed',
    kind: 'element',
    createdAt: 0,
    note: 'a note',
    target: targetFor('#missing', 'div'),
  };
}

function seedChangelog(): Changelog {
  return {
    id: 'cl',
    url: location.href,
    title: 'doc',
    capturedAt: 0,
    annotations: [seedAnnotation()],
  };
}

const noop = (): void => undefined;

function noopContext(): DrawContext {
  return {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fillRect: noop,
    strokeRect: noop,
    stroke: noop,
    fill: noop,
    fillText: noop,
  };
}

function fakeCompositeDeps(): CompositeDeps {
  const image: LoadedImage = { width: 10, height: 10, source: {} as CanvasImageSource };
  const surface: CompositeSurface = {
    context: noopContext(),
    drawImage: noop,
    toBlob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
  };
  return { loadImage: () => Promise.resolve(image), createSurface: () => surface };
}

// A fake ExportSink plus its `write` spy returned alongside, so a caller can assert
// on the spy directly (a member reference like `s.write` would trip unbound-method).
function fakeSink(
  opts: { result?: ExportResult; isAvailable?: boolean; shouldReject?: boolean } = {},
): { sink: ExportSink; write: ReturnType<typeof vi.fn<WriteFn>> } {
  const { result = {}, isAvailable = true, shouldReject = false } = opts;
  const write = vi.fn<WriteFn>(() =>
    shouldReject ? Promise.reject(new Error('write failed')) : Promise.resolve(result),
  );
  return { sink: { id: 'fake', isAvailable: () => Promise.resolve(isAvailable), write }, write };
}

function makeDaemon(over: Partial<HostAdapters['daemon']> = {}): HostAdapters['daemon'] {
  return {
    permitted: () => Promise.resolve(true),
    health: () => Promise.resolve({ reachable: true, version: '9.9.9', minExtension: '0.0.1' }),
    sink: fakeSink({ result: { ref: 'abc' } }).sink,
    ...over,
  };
}

// Defaults omit `now`/`createId` so the session's real `Date.now`/`crypto.randomUUID`
// fallbacks are exercised; nothing here asserts on the generated id or timestamp.
function makeAdapters(over: Partial<HostAdapters> = {}): HostAdapters {
  return {
    getSettings: () => Promise.resolve(DEFAULT_SETTINGS),
    changelog: { load: () => Promise.resolve(seedChangelog()), save: () => Promise.resolve() },
    pendingImport: { load: () => Promise.resolve(null), clear: () => Promise.resolve() },
    captureScreenshot: () => Promise.resolve('data:image/png;base64,AAAA'),
    clipboard: { writeText: () => Promise.resolve() },
    exportSink: fakeSink().sink,
    daemon: makeDaemon(),
    getVersion: () => '9.9.9',
    openOptions: noop,
    ...over,
  };
}

let active: AnnotationSession | null = null;

async function mount(
  adapters: HostAdapters,
): Promise<{ container: HTMLElement; session: AnnotationSession }> {
  // Inject the canvas stub here (an internal, non-host seam) so export paths build a
  // payload without a real 2D canvas under happy-dom.
  const session = await createAnnotationSession(adapters, { compositeDeps: fakeCompositeDeps() });
  active = session;
  const container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    session.mountView(container);
    await Promise.resolve();
  });
  return { container, session };
}

afterEach(() => {
  active?.unmountView();
  active = null;
  document.body.innerHTML = '';
  delete document.documentElement.dataset['stmLastExport'];
  delete document.documentElement.dataset['stmLastShare'];
});

describe('createAnnotationSession', () => {
  it('renders the panel into the container and tears it down', async () => {
    const { container, session } = await mount(makeAdapters());
    const q = within(container);
    expect(q.getByRole('button', { name: 'Copy to clipboard' })).toBeInTheDocument();
    session.unmountView();
    active = null;
    expect(container.querySelector('.stm-panel')).toBeNull();
  });

  it('falls back to an empty changelog when none is stored', async () => {
    const { container } = await mount(
      makeAdapters({
        changelog: { load: () => Promise.resolve(null), save: () => Promise.resolve() },
      }),
    );
    expect(within(container).getByText(/No annotations yet/)).toBeInTheDocument();
  });

  it('hydrates a claimed import and summarizes placement', async () => {
    const clear = vi.fn(() => Promise.resolve());
    const save = vi.fn(() => Promise.resolve());
    const brief = buildBrief(seedChangelog());
    const { container } = await mount(
      makeAdapters({
        changelog: { load: () => Promise.resolve(null), save },
        pendingImport: { load: () => Promise.resolve({ brief, createdAt: Date.now() }), clear },
      }),
    );
    expect(clear).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(within(container).getByText(/Placed/)).toBeInTheDocument();
  });

  it('exports the composited payload to the clipboard sink', async () => {
    const { sink, write } = fakeSink();
    const { container } = await mount(makeAdapters({ exportSink: sink }));
    fireEvent.click(within(container).getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => {
      expect(write).toHaveBeenCalledTimes(1);
    });
    expect(document.documentElement.dataset['stmLastExport']).toContain('# Change brief');
  });

  it('drives a BindingSink (the non-clipboard export path) end to end', async () => {
    const deliver = vi.fn<(payload: ExportPayload) => Promise<void>>(() => Promise.resolve());
    const { container } = await mount(makeAdapters({ exportSink: new BindingSink(deliver) }));
    fireEvent.click(within(container).getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => {
      expect(deliver).toHaveBeenCalledTimes(1);
    });
    const payload = deliver.mock.calls[0]?.[0];
    expect(payload?.markdown).toContain('# Change brief');
    expect(payload?.image).toBeInstanceOf(Blob);
  });

  it('skips the write when the clipboard sink is unavailable', async () => {
    const { sink, write } = fakeSink({ isAvailable: false });
    const { container } = await mount(makeAdapters({ exportSink: sink }));
    fireEvent.click(within(container).getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => {
      expect(document.documentElement.dataset['stmLastExport']).toBeDefined();
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('returns no payload (and never writes) when the screenshot fails', async () => {
    const { sink, write } = fakeSink();
    const { container } = await mount(
      makeAdapters({
        exportSink: sink,
        captureScreenshot: () => Promise.reject(new Error('no gesture')),
      }),
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => {
      expect(document.documentElement.dataset['stmLastExport']).toBeDefined();
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('copies a share link and reports success', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { container } = await mount(makeAdapters({ clipboard: { writeText } }));
    fireEvent.click(within(container).getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(document.documentElement.dataset['stmLastShare']).toMatch(/^stm1:/);
    expect(within(container).getByText(/share link copied/)).toBeInTheDocument();
  });

  it('reports a share-link copy failure', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    const { container } = await mount(makeAdapters({ clipboard: { writeText } }));
    fireEvent.click(within(container).getByRole('button', { name: 'Copy share link' }));
    expect(await within(container).findByText(/couldn/)).toBeInTheDocument();
  });

  it('guides to setup when the daemon is not permitted, and opens options', async () => {
    const openOptions = vi.fn();
    const { sink, write } = fakeSink({ result: { ref: 'abc' } });
    const { container } = await mount(
      makeAdapters({
        openOptions,
        daemon: makeDaemon({ permitted: () => Promise.resolve(false), sink }),
      }),
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Send to agent' }));
    const setup = await within(container).findByRole('button', { name: 'Open setup' });
    expect(within(container).getByText(/enable/)).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(setup);
    expect(openOptions).toHaveBeenCalledTimes(1);
  });

  it('reports when the daemon is unreachable', async () => {
    const { container } = await mount(
      makeAdapters({ daemon: makeDaemon({ health: () => Promise.resolve({ reachable: false }) }) }),
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Send to agent' }));
    expect(await within(container).findByText(/no daemon yet/)).toBeInTheDocument();
  });

  it('warns when the daemon is too old', async () => {
    const { container } = await mount(
      makeAdapters({
        daemon: makeDaemon({
          health: () => Promise.resolve({ reachable: true, version: '0.0.1' }),
        }),
      }),
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Send to agent' }));
    expect(await within(container).findByText(/out of date/)).toBeInTheDocument();
  });

  it('warns when the extension is too old', async () => {
    const { container } = await mount(
      makeAdapters({
        getVersion: () => '1.0.0',
        daemon: makeDaemon({
          health: () =>
            Promise.resolve({ reachable: true, version: '9.9.9', minExtension: '99.0.0' }),
        }),
      }),
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Send to agent' }));
    expect(
      await within(container).findByText(/update the share-the-mark extension/),
    ).toBeInTheDocument();
  });

  it('does not write to the daemon when the payload build fails', async () => {
    const { sink, write } = fakeSink({ result: { ref: 'abc' } });
    const { container } = await mount(
      makeAdapters({
        captureScreenshot: () => Promise.reject(new Error('no gesture')),
        daemon: makeDaemon({ sink }),
      }),
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Send to agent' }));
    await waitFor(() => {
      expect(document.documentElement.dataset['stmLastExport']).toBeDefined();
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('surfaces the handoff command when the brief is sent', async () => {
    // The default daemon sink returns { ref: 'abc' }.
    const { container } = await mount(makeAdapters());
    fireEvent.click(within(container).getByRole('button', { name: 'Send to agent' }));
    expect(await within(container).findByText('share-the-mark show abc')).toBeInTheDocument();
  });

  it('shows no handoff when the daemon returns no ref', async () => {
    const { container } = await mount(
      makeAdapters({ daemon: makeDaemon({ sink: fakeSink().sink }) }),
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Send to agent' }));
    await waitFor(() => {
      expect(within(container).getByRole('button', { name: 'Send to agent' })).toBeEnabled();
    });
    expect(within(container).queryByText(/✓ sent/)).toBeNull();
  });

  it('reports a daemon write failure', async () => {
    const { container } = await mount(
      makeAdapters({ daemon: makeDaemon({ sink: fakeSink({ shouldReject: true }).sink }) }),
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Send to agent' }));
    expect(await within(container).findByText(/failed to send/)).toBeInTheDocument();
  });

  it('switches the active tool', async () => {
    const { container } = await mount(makeAdapters());
    fireEvent.click(within(container).getByRole('button', { name: 'text' }));
    await waitFor(() => {
      expect(within(container).getByText('text')).toBeInTheDocument();
    });
  });

  it('persists a note edit', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { container } = await mount(
      makeAdapters({ changelog: { load: () => Promise.resolve(seedChangelog()), save } }),
    );
    fireEvent.change(within(container).getByRole('textbox', { name: /Note for/ }), {
      target: { value: 'updated' },
    });
    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
  });

  it('clears all annotations through the confirm flow', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { container } = await mount(
      makeAdapters({ changelog: { load: () => Promise.resolve(seedChangelog()), save } }),
    );
    const q = within(container);
    fireEvent.click(q.getByRole('button', { name: 'Clear all' }));
    fireEvent.click(q.getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      expect(q.getByText(/No annotations yet/)).toBeInTheDocument();
    });
    expect(save).toHaveBeenCalled();
  });

  it('imports none of the extension-only modules (browser-free invariant)', () => {
    const source = readFileSync(`${process.cwd()}/src/embed/session.ts`, 'utf8');
    for (const forbidden of [
      'wxt/browser',
      'wxt/utils/storage',
      '@/src/messaging',
      '@/src/capture/screenshot',
      '@/src/capture/clipboard-sink',
      '@/src/capture/daemon-sink',
    ]) {
      expect(source).not.toContain(`from '${forbidden}'`);
    }
  });
});
