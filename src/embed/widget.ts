/* eslint-disable unicorn/prefer-await -- `init` is a synchronous facade over the
   async mount(); its handle methods fire-and-forget into the `ready` promise. */
import type { ExportPayload, ExportSink } from '@/src/core/export';
import type { Settings } from '@/src/storage/settings-defaults';
import type { CompositeDeps } from '@/src/capture/composite';
import { mount, type MountOptions, type StmHandle } from './mount';
import { capturePage } from './screenshot';
import type { ScreenshotProvider, StorageAdapter } from './ports';

// Re-exported so a `<script>`-tag consumer can reach them on the global, e.g.
// `ShareTheMark.init({ storage: ShareTheMark.createLocalStorageStorage() })`.
export { createInMemoryStorage, createLocalStorageStorage } from './storage';

// Channel B (SPEC §13.5): the dev/staging `<script>` widget. esbuild bundles this
// entry with `globalName: 'ShareTheMark'`, so a developer's page can
// `<script src=share-the-mark.global.js>` then `ShareTheMark.init({ onExport })`.
// A thin wrapper over `mount()`: it maps the public config to MountOptions, ships a
// default page-capture provider (overridable), and defaults the export to copying
// the Markdown to the clipboard when no `onExport` is given.

// The panel CSS, inlined at build time (esbuild `define`; vitest defines it as '').
declare const __STM_PANEL_CSS__: string;

export interface WidgetConfig {
  /** Receive the export (Markdown + composited PNG). Default: copy Markdown to the clipboard. */
  onExport?: (payload: ExportPayload) => Promise<void> | void;
  /** Plug a full {@link ExportSink} instead of the `onExport` callback (wins if both given). */
  sink?: ExportSink;
  /** Override the default page-capture provider. */
  screenshot?: ScreenshotProvider;
  /** Changelog persistence (default: in-memory). See `createLocalStorageStorage`. */
  storage?: StorageAdapter;
  /** Override the default annotation settings. */
  settings?: Settings;
  /** Where to attach the shadow host (default: `document.body`). */
  parent?: HTMLElement;
}

// The widget is a per-page singleton, like the extension's single overlay. Held in
// an object so the assignment is a property write, not a top-level rebinding.
const widget: { handle: StmHandle | null } = { handle: null };

// `deps` is an internal, non-public test seam (the canvas plumbing), kept off the
// public `WidgetConfig` — the same split as `createAnnotationSession(adapters, deps)`.
export function init(
  config: WidgetConfig = {},
  deps: { compositeDeps?: CompositeDeps } = {},
): StmHandle {
  if (widget.handle) {
    console.warn('[share-the-mark] already initialised — returning the existing widget.');
    return widget.handle;
  }

  const { onExport: callback, sink } = config;
  const options: MountOptions = {
    styles: __STM_PANEL_CSS__,
    screenshot: config.screenshot ?? capturePage,
  };
  if (sink) {
    options.sink = sink;
  } else {
    // Deliver via the caller's callback or default to the clipboard; the async
    // wrapper coerces the (possibly `void`-returning) config callback to mount()'s
    // `Promise<void>`. An injected `sink` would win in mount()'s `resolveSink`.
    const deliver =
      callback ?? ((payload: ExportPayload) => navigator.clipboard.writeText(payload.markdown));
    options.onExport = async (payload: ExportPayload): Promise<void> => {
      await deliver(payload);
    };
  }
  if (config.storage) options.storage = config.storage;
  if (config.settings) options.settings = config.settings;
  if (config.parent) options.parent = config.parent;
  if (deps.compositeDeps) options.compositeDeps = deps.compositeDeps;

  // `mount()` is async, but a `<script>`-tag API reads best synchronously
  // (`const stm = ShareTheMark.init(...)`). Return a facade that queues behind the
  // mount promise; the view is interactive as soon as it resolves.
  const ready = mount(options);
  const handle: StmHandle = {
    open: () => {
      void ready.then((mounted) => {
        mounted.open();
      });
    },
    close: () => {
      void ready.then((mounted) => {
        mounted.close();
      });
    },
    destroy: () => {
      void ready.then((mounted) => {
        mounted.destroy();
      });
      widget.handle = null;
    },
    exportNow: () => ready.then((mounted) => mounted.exportNow()),
  };
  widget.handle = handle;
  return handle;
}
