export { createAnnotationSession } from './session';
export { mount, buildEmbedAdapters } from './mount';
// The default full-page DOM capture provider — also used by the extension's
// opt-in full-page capture mode (entrypoints/content.ts).
export { capturePage } from './screenshot';
export { init } from './widget';
// Default storage plug-ins for `mount({ storage })` / `init({ storage })`.
export { createInMemoryStorage, createLocalStorageStorage } from './storage';
// The export-delivery plug-point: implement `ExportSink` for custom delivery,
// or pass `onExport` and let `BindingSink` wrap it.
export { BindingSink } from '@/src/core/export';

export type { WidgetConfig } from './widget';
export type { MountOptions, StmHandle } from './mount';
export type { AnnotationSession, HostAdapters, ScreenshotProvider, StorageAdapter } from './ports';
export type { ExportSink, ExportPayload, ExportResult, ExportMeta } from '@/src/core/export';
export type { CapturedScreenshot } from '@/src/capture/composite';
