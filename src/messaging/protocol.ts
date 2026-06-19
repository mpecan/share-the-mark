import { defineExtensionMessaging } from '@webext-core/messaging';
import type { ExportMeta } from '@/src/core/export';

/** The brief the background forwards to the `share-the-mark` daemon (M2). */
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
  /**
   * Ensure the content script is running on a tab and mounted. The background
   * injects it on demand under `activeTab` (no broad host permission) — see
   * background.ts. Sent from the popup with the active tab id.
   */
  ensureActive: (tabId: number) => void;
  /**
   * Open a shared-mark URL in a new tab and inject the content script once it
   * loads, so the stashed import (SPEC §12) renders. The popup requests the
   * per-origin host permission first.
   */
  openSharedImport: (input: { url: string }) => void;
  captureVisibleTab: () => string;
  /** Content scripts cannot read their own tab id; the background supplies it. */
  getTabId: () => number;
  /** Has the user granted the optional loopback host permission (Options page)? */
  daemonPermitted: () => boolean;
  /** Is the local `share-the-mark` daemon reachable? */
  daemonHealth: () => boolean;
  /** POST a brief to the daemon; returns its assigned id. */
  sendBrief: (brief: BriefMessage) => { id: string };
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
