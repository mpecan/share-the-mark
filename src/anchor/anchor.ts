import { resolveSelector } from '@/src/core/selector';
import type { AnchoredPoint, Annotation, Point, Rect } from '@/src/core/model';
import { anchorRange } from './text-anchor';

// Resolve a content-anchored annotation to absolute viewport geometry by reading
// the live DOM. The target element scopes the text-anchor search; if it can't be
// resolved, fall back to the document body. Both the overlay (SVG) and the
// compositor (canvas) render from the ResolvedAnnotation this produces, so marks
// track the content across scroll/resize/reflow.

export type ResolvedAnnotation =
  | { id: string; kind: 'callout'; index: number; at: Point }
  | { id: string; kind: 'text'; content: string; at: Point }
  | { id: string; kind: 'arrow'; from: Point; to: Point }
  | { id: string; kind: 'highlight'; rects: Rect[] }
  | { id: string; kind: 'element'; rect: Rect };

export function toRect(domRect: DOMRect): Rect {
  return { x: domRect.x, y: domRect.y, width: domRect.width, height: domRect.height };
}

export function resolveGeometry(annotation: Annotation, doc: Document): ResolvedAnnotation | null {
  const element = resolveSelector(annotation.target, doc);

  // Element comments anchor to the whole element box, not to text.
  if (annotation.kind === 'element') {
    if (!element) return null;
    return { id: annotation.id, kind: 'element', rect: toRect(element.getBoundingClientRect()) };
  }

  const range = anchorRange(element ?? doc.body, annotation.anchor);
  if (!range) return null;

  // The reference frame every point-anchored mark measures its offset from. Today
  // that origin is the anchored character's box (text → body fallback handled
  // above); this `at` is the single seam where a future text → element → body
  // anchoring scheme would choose a different origin per mark. `plus` adds a
  // second offset in the same frame (an arrow's head-relative tail).
  const box = range.getBoundingClientRect();
  const at = (offset: AnchoredPoint, plus?: AnchoredPoint): Point => ({
    x: box.left + offset.dx + (plus?.dx ?? 0),
    y: box.top + offset.dy + (plus?.dy ?? 0),
  });

  switch (annotation.kind) {
    case 'callout': {
      return {
        id: annotation.id,
        kind: 'callout',
        index: annotation.index,
        at: at(annotation.offset),
      };
    }
    case 'text': {
      return {
        id: annotation.id,
        kind: 'text',
        content: annotation.note ?? '',
        at: at(annotation.offset),
      };
    }
    case 'arrow': {
      // The head is the anchor point; the tail is a vector from it.
      return {
        id: annotation.id,
        kind: 'arrow',
        from: at(annotation.offset, annotation.tail),
        to: at(annotation.offset),
      };
    }
    case 'highlight': {
      const rects = [...range.getClientRects()].map((rect) => toRect(rect));
      return { id: annotation.id, kind: 'highlight', rects };
    }
  }
}
