import type { AnchoredPoint, Point } from './changelog';

// Pure offset arithmetic shared by the overlay's edit math and the anchor
// resolver. Browser-free: these operate on plain coordinates, never the DOM.

/** Translate an anchored offset by a delta in CSS px. */
export function shiftOffset(offset: AnchoredPoint, dx: number, dy: number): AnchoredPoint {
  return { dx: offset.dx + dx, dy: offset.dy + dy };
}

/** The offset (CSS px) from `base` to `point`. */
export function pointOffset(point: Point, base: Point): AnchoredPoint {
  return { dx: point.x - base.x, dy: point.y - base.y };
}
