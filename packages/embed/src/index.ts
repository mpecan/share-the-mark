// Public API of `@share-the-mark/embed` — the browser-free, embeddable annotation
// widget (SPEC §13). Self-contained: React, html-to-image, and the panel CSS are
// bundled in, so a consumer just imports and mounts. The Node-side Playwright
// driver (`attach`) is a separate entry: `@share-the-mark/embed/playwright`.
export {
  mount,
  init,
  capturePage,
  createAnnotationSession,
  buildEmbedAdapters,
} from '../../../src/embed';
export type {
  MountOptions,
  StmHandle,
  WidgetConfig,
  HostAdapters,
  AnnotationSession,
} from '../../../src/embed';
export type { CapturedScreenshot } from '../../../src/capture/composite';
export type { ExportPayload, ExportSink } from '../../../src/core/export';
export type { Settings, CaptureMode, ThemeMode } from '../../../src/storage/settings-defaults';
