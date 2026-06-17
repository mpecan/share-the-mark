import { resolveSelector } from '@/src/core/selector';
import type { Annotation, Point, Rect } from '@/src/core/model';
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
  | { id: string; kind: 'highlight'; rects: Rect[] };

export function toRect(domRect: DOMRect): Rect {
  return { x: domRect.x, y: domRect.y, width: domRect.width, height: domRect.height };
}

export function resolveGeometry(annotation: Annotation, doc: Document): ResolvedAnnotation | null {
  const root = resolveSelector(annotation.target, doc) ?? doc.body;
  const range = anchorRange(root, annotation.anchor);
  if (!range) return null;

  switch (annotation.kind) {
    case 'callout': {
      const box = range.getBoundingClientRect();
      return {
        id: annotation.id,
        kind: 'callout',
        index: annotation.index,
        at: { x: box.left, y: box.top },
      };
    }
    case 'text': {
      const box = range.getBoundingClientRect();
      return {
        id: annotation.id,
        kind: 'text',
        content: annotation.content,
        at: { x: box.left, y: box.top },
      };
    }
    case 'arrow': {
      const box = range.getBoundingClientRect();
      const head: Point = { x: box.left, y: box.top };
      return {
        id: annotation.id,
        kind: 'arrow',
        from: { x: head.x + annotation.tail.dx, y: head.y + annotation.tail.dy },
        to: head,
      };
    }
    case 'highlight': {
      const rects = [...range.getClientRects()].map((rect) => toRect(rect));
      return { id: annotation.id, kind: 'highlight', rects };
    }
  }
}
