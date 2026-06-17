import { resolveSelector } from '@/src/core/selector';
import type { Annotation, Point, Rect } from '@/src/core/model';

// Anchor resolution: turn a content-anchored annotation into absolute viewport
// geometry by reading the live DOM. Both the overlay (SVG) and the compositor
// (canvas) render from the ResolvedAnnotation this produces, so marks track the
// content across scroll/resize/reflow.

export type ResolvedAnnotation =
  | { id: string; kind: 'callout'; index: number; at: Point }
  | { id: string; kind: 'text'; content: string; at: Point }
  | { id: string; kind: 'arrow'; from: Point; to: Point }
  | { id: string; kind: 'highlight'; rects: Rect[] };

export function toRect(domRect: DOMRect): Rect {
  return { x: domRect.x, y: domRect.y, width: domRect.width, height: domRect.height };
}

// Map a character offset within `root`'s text to a (textNode, localOffset) pair.
function locate(root: Element, offset: number): { node: Text; offset: number } | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (remaining <= text.data.length) return { node: text, offset: remaining };
    remaining -= text.data.length;
    node = walker.nextNode();
  }
  return null;
}

/** Character offset of a (node, nodeOffset) position within `root`'s text. */
export function textOffset(root: Element, container: Node, containerOffset: number): number {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === container) return total + containerOffset;
    total += (node as Text).data.length;
    node = walker.nextNode();
  }
  return total;
}

export function rangeFromOffsets(root: Element, start: number, end: number): Range | null {
  const a = locate(root, start);
  const b = locate(root, end);
  if (!a || !b) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** Character offsets of a selection range's endpoints within `root`'s text. */
export function offsetsForRange(root: Element, range: Range): { start: number; end: number } {
  return {
    start: textOffset(root, range.startContainer, range.startOffset),
    end: textOffset(root, range.endContainer, range.endOffset),
  };
}

export function resolveGeometry(annotation: Annotation, doc: Document): ResolvedAnnotation | null {
  const el = resolveSelector(annotation.target, doc);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  const point = (p: { dx: number; dy: number }): Point => ({
    x: box.left + p.dx,
    y: box.top + p.dy,
  });

  switch (annotation.kind) {
    case 'callout': {
      return {
        id: annotation.id,
        kind: 'callout',
        index: annotation.index,
        at: point(annotation.at),
      };
    }
    case 'text': {
      return {
        id: annotation.id,
        kind: 'text',
        content: annotation.content,
        at: point(annotation.at),
      };
    }
    case 'arrow': {
      return {
        id: annotation.id,
        kind: 'arrow',
        from: point(annotation.from),
        to: point(annotation.to),
      };
    }
    case 'highlight': {
      const range = rangeFromOffsets(el, annotation.startOffset, annotation.endOffset);
      const rects = range ? [...range.getClientRects()].map((rect) => toRect(rect)) : [];
      return { id: annotation.id, kind: 'highlight', rects };
    }
  }
}
