import { defineExtensionMessaging } from '@webext-core/messaging';
import type { ExportMeta } from '@/src/core/export';

/** The brief the background forwards to the `stm` daemon (M2). */
export interface BriefMessage {
  markdown: string;
  meta: ExportMeta;
  imageBase64: string;
}

// Typed message bus across extension contexts — SPEC §5.6. The background-only
// round-trips: `captureVisibleTab` (content scripts can't call it), and the M2
// daemon calls (`daemonHealth`/`sendBrief`) which need the loopback host
// permission and a CSP-free fetch context.
export interface ProtocolMap {
  activateAnnotationMode: () => void;
  deactivateAnnotationMode: () => void;
  exportAnnotations: () => void;
  captureVisibleTab: () => string;
  /** Content scripts cannot read their own tab id; the background supplies it. */
  getTabId: () => number;
  /** Is the local `stm` daemon reachable? */
  daemonHealth: () => boolean;
  /** POST a brief to the daemon; returns its assigned id. */
  sendBrief: (brief: BriefMessage) => { id: string };
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
