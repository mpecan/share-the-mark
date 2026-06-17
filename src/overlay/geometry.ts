import type { Annotation, Point, Rect, ToolKind } from '@/src/core/model';

// Pure geometry for the drawing overlay (SPEC §5.1). Turns a pointer gesture
// into the geometric payload of an annotation. Kept free of DOM so the tool
// logic is exhaustively unit-testable; the overlay assembles id/createdAt.

export interface Gesture {
  start: Point;
  current: Point;
  /** Sampled path, used by freeform tools (pencil, highlight). */
  points: Point[];
}

/** An annotation minus the fields the overlay assigns at creation time. */
export type AnnotationDraft = Annotation extends infer A
  ? A extends Annotation
    ? Omit<A, 'id' | 'createdAt'>
    : never
  : never;

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function buildAnnotationData(tool: ToolKind, gesture: Gesture): AnnotationDraft {
  switch (tool) {
    case 'callout': {
      return { kind: 'callout', index: 0, anchor: gesture.start };
    }
    case 'pencil': {
      return { kind: 'pencil', path: gesture.points };
    }
    case 'arrow': {
      return { kind: 'arrow', from: gesture.start, to: gesture.current };
    }
    case 'rectangle': {
      return { kind: 'rectangle', rect: normalizeRect(gesture.start, gesture.current) };
    }
    case 'ellipse': {
      return { kind: 'ellipse', rect: normalizeRect(gesture.start, gesture.current) };
    }
    case 'text': {
      return { kind: 'text', position: gesture.start, content: '' };
    }
    case 'highlight': {
      return { kind: 'highlight', rects: [normalizeRect(gesture.start, gesture.current)] };
    }
  }
}

const DRAG_TOOLS = new Set<ToolKind>(['arrow', 'rectangle', 'ellipse', 'highlight']);

/** Whether a tool builds its shape from a click-drag (vs. a freeform path). */
export function isDragTool(tool: ToolKind): boolean {
  return DRAG_TOOLS.has(tool);
}
