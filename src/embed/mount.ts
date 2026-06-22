import { BindingSink, type ExportPayload } from '@/src/core/export';
import type { PanelActions } from '@/src/panel';
import { DEFAULT_SETTINGS, type Settings } from '@/src/storage/settings-defaults';
import type { Changelog } from '@/src/core/model';
import type { CompositeDeps } from '@/src/capture/composite';
import { createAnnotationSession } from './session';
import type { HostAdapters, AnnotationSession } from './ports';

// The SPEC §13.2 convenience entry: a browser-free `mount()` that stands up the
// annotation UI in any page, without the extension. It builds the real
// `HostAdapters` (ports.ts) from embed-appropriate defaults — in-memory changelog,
// no pending-import/daemon, a `BindingSink` for export — creates an open shadow
// root, and drives `createAnnotationSession`. The Playwright (channel A), dev-
// widget (B), and local-serve (C) channels all call this; each only supplies a
// `screenshot` provider and an `onExport` callback. Browser-free: imports none of
// `wxt/*`, the message bus, or the message-coupled capture sinks (a guard test
// enforces it).

// A made-up version for the daemon compat handshake; unused in practice because
// the embed disables the daemon (`permitted: false` short-circuits send-to-agent).
const EMBED_VERSION = '0.0.0-embed';

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
  /** Capture the page as a PNG data URL; the session composites the marks onto it. */
  screenshot: () => Promise<string>;
  /** Receive the composited export payload (Markdown + annotated PNG). */
  onExport: (payload: ExportPayload) => Promise<void>;
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
  const changelogs = new Map<string, Changelog>();
  const sink = new BindingSink(opts.onExport);
  return {
    getSettings: () => Promise.resolve(opts.settings ?? DEFAULT_SETTINGS),
    changelog: {
      load: (url) => Promise.resolve(changelogs.get(url) ?? null),
      save: (changelog) => {
        changelogs.set(changelog.url, changelog);
        return Promise.resolve();
      },
    },
    pendingImport: { load: () => Promise.resolve(null), clear: () => Promise.resolve() },
    captureScreenshot: opts.screenshot,
    clipboard: { writeText: (text) => navigator.clipboard.writeText(text) },
    exportSink: sink,
    // No daemon off-extension: report it unreachable so send-to-agent is a no-op.
    daemon: {
      permitted: () => Promise.resolve(false),
      health: () => Promise.resolve({ reachable: false }),
      sink,
    },
    getVersion: () => EMBED_VERSION,
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
