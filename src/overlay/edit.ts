import { computeSelector, resolveSelector, type TargetRef } from '@/src/core/selector';
import { anchorRange, describeRange } from '@/src/anchor';
import type {
  Annotation,
  ArrowAnnotation,
  CalloutAnnotation,
  HighlightAnnotation,
  Point,
  TextAnchor,
  TextAnnotation,
  ToolKind,
} from '@/src/core/model';
import type { PageHitTester } from './hit-test';

// The editing model (SPEC §5.1): how an in-progress drag maps to an updated
// annotation. Pure offset math lives in applyEdit; the DOM-dependent re-anchoring
// (caret hit-test → fresh TextAnchor) lives in AnchorEditor.

export type DraggableAnnotation = CalloutAnnotation | TextAnnotation | ArrowAnnotation;
export type EditableAnnotation = DraggableAnnotation | HighlightAnnotation;
export type EditHandle = 'from' | 'to' | 'start' | 'end' | 'move';

export interface EditState {
  origin: EditableAnnotation;
  handle: EditHandle;
  start: Point;
  current: Point;
}

const DRAGGABLE_KINDS = new Set<ToolKind>(['callout', 'text', 'arrow']);

export function isDraggable(annotation: Annotation): annotation is DraggableAnnotation {
  return DRAGGABLE_KINDS.has(annotation.kind);
}

// Apply a drag delta to a draggable annotation: moving updates the offset(s);
// dragging an arrow endpoint updates just that endpoint. (Highlights re-anchor
// against the DOM instead — see AnchorEditor.editedHighlight.)
export function applyEdit(
  origin: DraggableAnnotation,
  dx: number,
  dy: number,
  handle: EditHandle,
): DraggableAnnotation {
  if (origin.kind === 'arrow') {
    const from =
      handle === 'to' ? origin.from : { dx: origin.from.dx + dx, dy: origin.from.dy + dy };
    const to = handle === 'from' ? origin.to : { dx: origin.to.dx + dx, dy: origin.to.dy + dy };
    return { ...origin, from, to };
  }
  return { ...origin, offset: { dx: origin.offset.dx + dx, dy: origin.offset.dy + dy } };
}

export class AnchorEditor {
  constructor(
    private readonly doc: Document,
    private readonly hitTester: PageHitTester,
  ) {}

  // Resolve an edit to an updated annotation. The live preview passes
  // shouldReanchor=false (cheap offset delta); the drop passes true to re-bind a
  // moved mark to the text it landed on.
  editedAnnotation(edit: EditState, shouldReanchor: boolean): Annotation {
    if (edit.origin.kind === 'highlight')
      return this.editedHighlight(edit.origin, edit) ?? edit.origin;
    if (shouldReanchor) {
      const reanchored = this.reanchorDraggable(edit);
      if (reanchored) return reanchored;
    }
    return applyEdit(
      edit.origin,
      edit.current.x - edit.start.x,
      edit.current.y - edit.start.y,
      edit.handle,
    );
  }

  // On drop, re-bind a moved mark to the text under where it landed: re-anchor
  // the callout/text point or the arrow head, recomputing offsets so the mark
  // stays exactly where dropped. Returns null (→ keep the original anchor) when
  // the drop point isn't over page text, or for an arrow tail (head unmoved).
  private reanchorDraggable(edit: EditState): DraggableAnnotation | null {
    const origin = edit.origin;
    if (origin.kind === 'highlight') return null;
    const base = this.anchorBase(origin);
    if (!base) return null;
    const dx = edit.current.x - edit.start.x;
    const dy = edit.current.y - edit.start.y;

    if (origin.kind === 'arrow') {
      if (edit.handle === 'from') return null; // tail drag leaves the head anchor put
      const head = { x: base.x + origin.to.dx + dx, y: base.y + origin.to.dy + dy };
      const tailShift = edit.handle === 'to' ? 0 : 1; // 'move' shifts the tail too
      const tail = {
        x: base.x + origin.from.dx + dx * tailShift,
        y: base.y + origin.from.dy + dy * tailShift,
      };
      const re = this.anchorAtPoint(head);
      if (!re) return null;
      return {
        ...origin,
        target: re.target,
        anchor: re.anchor,
        from: { dx: tail.x - re.base.x, dy: tail.y - re.base.y },
        to: { dx: head.x - re.base.x, dy: head.y - re.base.y },
      };
    }

    // callout / text: the mark itself is the anchor point.
    const at = { x: base.x + origin.offset.dx + dx, y: base.y + origin.offset.dy + dy };
    const re = this.anchorAtPoint(at);
    if (!re) return null;
    return {
      ...origin,
      target: re.target,
      anchor: re.anchor,
      offset: { dx: at.x - re.base.x, dy: at.y - re.base.y },
    };
  }

  // Top-left of the character a mark is currently anchored to (viewport coords).
  private anchorBase(annotation: DraggableAnnotation): Point | null {
    const element = resolveSelector(annotation.target, this.doc) ?? this.doc.body;
    const range = anchorRange(element, annotation.anchor);
    if (!range) return null;
    const box = range.getBoundingClientRect();
    return { x: box.left, y: box.top };
  }

  // Anchor (target + TextAnchor + char box) for the character under a point.
  private anchorAtPoint(
    point: Point,
  ): { target: TargetRef; anchor: TextAnchor; base: Point } | null {
    const hit = this.hitTester.caretAt(point);
    if (!hit) return null;
    const box = hit.range.getBoundingClientRect();
    return {
      target: computeSelector(hit.element),
      anchor: describeRange(hit.element, hit.range),
      base: { x: box.left, y: box.top },
    };
  }

  // Re-anchor a highlight: rebuild its text range from the fixed endpoint to the
  // caret under the dragged handle, then describe it as a fresh TextAnchor.
  private editedHighlight(
    origin: HighlightAnnotation,
    edit: EditState,
  ): HighlightAnnotation | null {
    const element = resolveSelector(origin.target, this.doc) ?? this.doc.body;
    const current = anchorRange(element, origin.anchor);
    if (!current) return null;
    const caret = this.hitTester.caretRangeAt(edit.current);
    if (!caret) return null;
    const range = this.doc.createRange();
    try {
      if (edit.handle === 'start') {
        range.setStart(caret.startContainer, caret.startOffset);
        range.setEnd(current.endContainer, current.endOffset);
      } else {
        range.setStart(current.startContainer, current.startOffset);
        range.setEnd(caret.startContainer, caret.startOffset);
      }
    } catch {
      return null; // boundaries crossed over — ignore this move
    }
    if (range.collapsed || !element.contains(range.commonAncestorContainer)) return null;
    return { ...origin, anchor: describeRange(element, range) };
  }
}
