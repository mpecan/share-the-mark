export { createAnnotationSession } from './session';
export { mount, buildEmbedAdapters } from './mount';
// The default full-page DOM capture provider — also used by the extension's
// opt-in full-page capture mode (entrypoints/content.ts).
export { capturePage } from './screenshot';
export { init } from './widget';
export type { WidgetConfig } from './widget';
export type { MountOptions, StmHandle } from './mount';
export type { AnnotationSession, HostAdapters } from './ports';
