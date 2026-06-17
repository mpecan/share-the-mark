import { defineExtensionMessaging } from '@webext-core/messaging';

// Typed message bus across extension contexts — SPEC §5.6. `captureVisibleTab`
// is the only message that must round-trip to the background service worker
// (content scripts cannot call `tabs.captureVisibleTab`); it returns a data URL.
export interface ProtocolMap {
  activateAnnotationMode: () => void;
  deactivateAnnotationMode: () => void;
  exportAnnotations: () => void;
  captureVisibleTab: () => string;
  /** Content scripts cannot read their own tab id; the background supplies it. */
  getTabId: () => number;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
