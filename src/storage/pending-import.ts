import { storage } from 'wxt/utils/storage';
import type { PendingImport } from '@/src/share';

// A single-slot handoff for cross-machine import (SPEC §12.2): the popup stashes a
// decoded brief here, then opens the target URL in a new tab; that tab's content
// script claims the slot on startup (see claimPendingImport). One slot is enough —
// imports are user-initiated, one at a time — and clearing on claim is idempotent.

const PENDING_IMPORT_KEY = 'local:pendingImport:v1';

export function savePendingImport(pending: PendingImport): Promise<void> {
  return storage.setItem(PENDING_IMPORT_KEY, pending);
}

export function loadPendingImport(): Promise<PendingImport | null> {
  return storage.getItem<PendingImport>(PENDING_IMPORT_KEY);
}

export function clearPendingImport(): Promise<void> {
  return storage.removeItem(PENDING_IMPORT_KEY);
}
