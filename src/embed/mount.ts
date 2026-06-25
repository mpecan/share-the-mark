import { BindingSink, type ExportPayload, type ExportSink } from '@/src/core/export';
import type { PanelActions } from '@/src/panel';
import { DEFAULT_SETTINGS, type Settings } from '@/src/storage/settings-defaults';
import type { CompositeDeps } from '@/src/capture/composite';
import { createAnnotationSession } from './session';
import { createInMemoryStorage } from './storage';
import type { HostAdapters, AnnotationSession, ScreenshotProvider, StorageAdapter } from './ports';

// The SPEC §13.2 convenience entry: a browser-free `mount()` that stands up the
// annotation UI in any page, without the extension. It builds the real
// `HostAdapters` (ports.ts) from embed-appropriate defaults — in-memory changelog,
// no pending-import/daemon, a `BindingSink` for export — creates an open shadow
// root, and drives `createAnnotationSession`. The Playwright (channel A), dev-
// widget (B), and local-serve (C) channels all call this; each only supplies a
// `screenshot` provider and an `onExport` callback. Browser-free: imports none of
// `wxt/*`, the message bus, or the message-coupled capture sinks (a guard test
// enforces it).

// The package version, inlined at build time (esbuild `define`, like the panel
// CSS); vitest stubs it. Reported on the daemon compat handshake — unused in
// practice off-extension (`permitted: false` short-circuits send-to-agent). Read
// lazily inside `getVersion` (not at module top level): the extension imports
// this barrel without an `__STM_VERSION__` define, and only the embed channels
// ever call it, so a deferred read avoids a load-time ReferenceError there —
// the same deferral `widget.ts` uses for `__STM_PANEL_CSS__`.
declare const __STM_VERSION__: string;

/**
 * Footer preset for single-delivery, agent-bound channels (Playwright A, local-serve
 * C): one button labelled for what it does, since the export sink *is* the agent
 * submit. The extension and the dev widget omit `panelActions` and get the full set.
 * (The deeper capability-driven model is tracked in #14.)
 */
export const AGENT_PANEL_ACTIONS: PanelActions = {
  exportLabel: 'Send to agent',
  showSendToAgent: false,
  showShareLink: false,
};

export interface MountOptions {
  /** Capture the page (PNG data URL + image origin); the session composites the marks onto it. */
  screenshot: ScreenshotProvider;
  /**
   * Where the composited export (Markdown + annotated PNG) is delivered. Supply a
   * full {@link ExportSink} to plug your own delivery (server POST, FileSystem,
   * retries), or an `onExport` callback (wrapped in a `BindingSink`). `mount()`
   * requires one of the two; `sink` wins if both are given.
   */
  sink?: ExportSink;
  /** Receive the composited export payload — the callback form of `sink`. */
  onExport?: (payload: ExportPayload) => Promise<void>;
  /** Changelog persistence (default: in-memory). See `createLocalStorageStorage`. */
  storage?: StorageAdapter;
  /** Panel CSS injected into the shadow root — the embed has no WXT cssInjectionMode. */
  styles?: string;
  /** Override the default annotation settings. */
  settings?: Settings;
  /** Where to attach the shadow host (default: `document.body`). */
  parent?: HTMLElement;
  /** Footer button config; omit for the full set, override for a single-button channel. */
  panelActions?: PanelActions;
  /** Test seam: canvas plumbing for compositing (default: the real OffscreenCanvas). */
  compositeDeps?: CompositeDeps;
}

// Resolve the one export sink from the options: an injected sink wins, else the
// `onExport` callback is wrapped in a `BindingSink`. mount() needs one of them.
function resolveSink(opts: MountOptions): ExportSink {
  if (opts.sink) return opts.sink;
  if (opts.onExport) return new BindingSink(opts.onExport);
  throw new Error('share-the-mark mount(): provide `sink` or `onExport` to receive the export.');
}

export interface StmHandle {
  /** Re-mount the view into the embed's container (after `close`). */
  open(): void;
  /** Tear the view down (overlay + panel) but keep the host element. */
  close(): void;
  /** Tear down and remove the host element from the page. */
  destroy(): void;
  /** Build and deliver the export payload programmatically (no panel click needed). */
  exportNow(): Promise<void>;
}

// The embed's `HostAdapters`: in-memory and daemon-less. Factored out of `mount`
// so each adapter closure is directly unit-testable (the draw/export paths that
// would exercise them can't all be driven under happy-dom).
export function buildEmbedAdapters(opts: MountOptions): HostAdapters {
  const storage = opts.storage ?? createInMemoryStorage();
  const sink = resolveSink(opts);
  return {
    getSettings: () => Promise.resolve(opts.settings ?? DEFAULT_SETTINGS),
    changelog: storage.changelog,
    pendingImport: storage.pendingImport,
    captureScreenshot: opts.screenshot,
    clipboard: { writeText: (text) => navigator.clipboard.writeText(text) },
    exportSink: sink,
    // No daemon off-extension: report it unreachable so send-to-agent is a no-op.
    daemon: {
      permitted: () => Promise.resolve(false),
      health: () => Promise.resolve({ reachable: false }),
      sink,
    },
    getVersion: () => __STM_VERSION__,
    openOptions: () => {
      // No options page off-extension; nothing to open.
    },
    panelActions: opts.panelActions,
  };
}

export async function mount(opts: MountOptions): Promise<StmHandle> {
  const host = document.createElement('div');
  host.dataset['stmEmbed'] = 'true';
  const shadow = host.attachShadow({ mode: 'open' });
  if (opts.styles !== undefined) {
    const style = document.createElement('style');
    style.textContent = opts.styles;
    shadow.append(style);
  }
  const container = document.createElement('div');
  shadow.append(container);
  (opts.parent ?? document.body).append(host);

  const deps = opts.compositeDeps === undefined ? {} : { compositeDeps: opts.compositeDeps };
  const session: AnnotationSession = await createAnnotationSession(buildEmbedAdapters(opts), deps);
  session.mountView(container);

  return {
    open: () => {
      session.mountView(container);
    },
    close: () => {
      session.unmountView();
    },
    destroy: () => {
      session.unmountView();
      host.remove();
    },
    exportNow: () => session.exportAnnotations(),
  };
}
