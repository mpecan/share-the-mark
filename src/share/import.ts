import { resolveGeometry } from '@/src/anchor';
import { annotationLabel } from '@/src/core/export';
import { isSameTarget, type ShareBrief } from '@/src/core/share';
import type { Annotation } from '@/src/core/model';

// Recipient-side import logic (SPEC §12.2), kept pure so it's testable without the
// extension runtime. The popup stashes a PendingImport; the content script claims
// it on startup if it's fresh and the tab landed on the right page.

export interface PendingImport {
  brief: ShareBrief;
  createdAt: number;
}

// A pending import is consumed by the tab the popup just opened, so it should be
// claimed within moments — refuse a stale slot so it can't hijack a later navigation.
const MAX_PENDING_AGE_MS = 2 * 60 * 1000;

export function claimPendingImport(input: {
  pending: PendingImport | null;
  href: string;
  now: number;
}): ShareBrief | null {
  const { pending, href, now } = input;
  if (!pending) return null;
  if (now - pending.createdAt > MAX_PENDING_AGE_MS) return null;
  if (!isSameTarget(pending.brief.url, href)) return null;
  return pending.brief;
}

export interface PlacementSummary {
  placed: number;
  total: number;
  orphans: { id: string; label: string }[];
}

/**
 * Resolve each imported mark against the live DOM. Marks whose anchor no longer
 * resolves (`resolveGeometry === null`) are listed as orphans — the panel reports
 * "placed N of M" so a drifted page loses nothing silently. `resolve` is injected
 * for tests.
 */
export function summarizePlacement(
  annotations: readonly Annotation[],
  doc: Document,
  resolve: (annotation: Annotation, doc: Document) => unknown = resolveGeometry,
): PlacementSummary {
  const orphans = annotations
    .filter((annotation) => resolve(annotation, doc) === null)
    .map((annotation) => ({ id: annotation.id, label: annotationLabel(annotation) }));
  return { placed: annotations.length - orphans.length, total: annotations.length, orphans };
}
