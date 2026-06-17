import { defineExtensionMessaging } from '@webext-core/messaging';

// Typed message bus across extension contexts — SPEC §5.6. `captureVisibleTab`
// is the only message that must round-trip to the background service worker
// (content scripts cannot call `tabs.captureVisibleTab`); it returns a data URL.
export interface ProtocolMap {
  activateAnnotationMode: () => void;
  deactivateAnnotationMode: () => void;
  captureVisibleTab: () => string;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
