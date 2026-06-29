import type { Changelog } from '@/src/core/model';
import type { CapturedScreenshot } from '@/src/capture/composite';
import type { ExportSink } from '@/src/core/export';
import type { PendingImport } from '@/src/share';
import type { Settings } from '@/src/storage/settings-defaults';
import type { DaemonHealth } from '@/src/messaging';
import type { PanelCapabilities } from '@/src/panel';

// The host ports the browser-free annotation session (SPEC §13.2) depends on.
// Every extension-specific capability — storage, screenshot capture, the message
// bus, the manifest version, the Options page — is injected through here, so the
// same `createAnnotationSession` orchestration backs the extension today and the
// non-extension channels (Playwright, a dev `<script>` widget, the local-serve
// artifact loop) later. The session imports none of `wxt/*`, `@/src/messaging`,
// or the message-coupled capture sinks; it only ever touches these ports.
//
// These are types only — the concrete, browser-coupled implementations live in
// the entrypoint (`entrypoints/content.ts`), which is excluded from coverage.

/**
 * Capture the page as a PNG plus the document-space origin of the image's
 * top-left. The single public capture port — an embedder passes one to
 * `mount({ screenshot })`; the extension supplies its `captureVisibleTab` path.
 */
export type ScreenshotProvider = () => Promise<CapturedScreenshot>;

/**
 * The persistence an embedder can plug into `mount({ storage })`: per-URL
 * changelog storage plus the single-slot cross-machine import handoff. Defaults
 * to in-memory; `createLocalStorageStorage` persists across reloads. The
 * extension supplies its own `browser.storage`-backed implementation.
 */
export interface StorageAdapter {
  /**
   * Per-tab+URL changelog persistence. Pre-bound to a tab id by the host (a tab
   * id is meaningless off-extension), so the session never sees one.
   */
  changelog: {
    load(url: string): Promise<Changelog | null>;
    save(changelog: Changelog): Promise<void>;
  };
  /** The single-slot cross-machine import handoff (SPEC §12.2). */
  pendingImport: {
    load(): Promise<PendingImport | null>;
    clear(): Promise<void>;
  };
}

export interface HostAdapters extends StorageAdapter {
  getSettings(): Promise<Settings>;
  /**
   * Capture the page as a PNG plus the document-space origin of the image's
   * top-left (`{0,0}` viewport / `{scrollX,scrollY}` full-page); the session
   * composites the marks on, shifting them by the offset.
   */
  captureScreenshot(): Promise<CapturedScreenshot>;
  /** Plain text to the clipboard — the cross-machine share token (SPEC §12). */
  clipboard: { writeText(text: string): Promise<void> };
  /**
   * Sink for the composited Markdown + PNG export (SPEC §5.4). A host injects
   * `ClipboardSink` (the extension) or `BindingSink` (automation / local-serve).
   */
  exportSink: ExportSink;
  /** The local `share-the-mark` daemon path (SPEC §5.4, M2). */
  daemon: {
    permitted(): Promise<boolean>;
    health(): Promise<DaemonHealth>;
    sink: ExportSink;
  };
  /** The host version, for the daemon compatibility handshake (SPEC §11.4). */
  getVersion(): string;
  /** Open the host's setup surface (the extension Options page). */
  openOptions(): void;
  /**
   * The host's declared footer capabilities (SPEC §13.6). Omit for the extension's
   * full set; a single-delivery channel (local-serve) declares only `exportLabel`
   * so its one wired button reads for what it does.
   */
  capabilities?: PanelCapabilities | undefined;
  /** Injectable clock/id for tests; default to `Date.now`/`crypto.randomUUID`. */
  now?: () => number;
  createId?: () => string;
}

/**
 * A mounted annotation session. The session loads its state once; the host drives
 * the view lifecycle (`mountView`/`unmountView`) — for the extension these map to
 * WXT's `createShadowRootUi` `onMount`/`onRemove`, which recreate the container on
 * every activation. (The SPEC §13.2 `mount()` convenience wrapper — stable
 * container, `open`/`close` — is a later channel built on top of this.)
 */
export interface AnnotationSession {
  /** Build the overlay + panel into a host-provided container and wire handlers. */
  mountView(container: HTMLElement): void;
  /** Tear the view down (keyboard isolation, overlay, React root). */
  unmountView(): void;
  /** Run the export action (the `exportAnnotations` msg): build the payload and
   * write it to the injected `exportSink`. */
  exportAnnotations(): Promise<void>;
}
