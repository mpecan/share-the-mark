import type { TargetRef } from '@/src/core/selector';

// Annotation model and the callout-numbering reducer — SPEC §5.3. Pure and
// browser-free: ids/timestamps are supplied by callers (the overlay), so this
// module stays deterministic and exhaustively testable.
//
// Annotations are anchored to the DOM, not to viewport coordinates: markers and
// arrows store an offset from their target element's box, highlights store a
// character range within their target element's text. Absolute positions are
// derived at render time from the live element, so marks track the content
// across scroll/resize/reflow.

export type ToolKind = 'callout' | 'text' | 'arrow' | 'highlight';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A point expressed as an offset (CSS px) from the anchor point. */
export interface AnchoredPoint {
  dx: number;
  dy: number;
}

/**
 * A content-based text anchor (W3C Web Annotation model): a TextPositionSelector
 * (character offsets) plus a TextQuoteSelector (exact text + prefix/suffix
 * context), relative to the annotation's target element. Resolved with fallback
 * in `src/anchor`. Pure data — no DOM here.
 */
export interface TextAnchor {
  start: number;
  end: number;
  exact: string;
  prefix: string;
  suffix: string;
}

export interface AnnotationBase {
  id: string;
  kind: ToolKind;
  createdAt: number;
  /** The label shown in the changelog. */
  note?: string;
  /** Coarse anchor + export reference: the target element's selector. */
  target: TargetRef;
  /** Precise content anchor (text position + quote) within the target element. */
  anchor: TextAnchor;
}

export interface CalloutAnnotation extends AnnotationBase {
  kind: 'callout';
  /** Auto-numbered, 1-based, gap-free — owned by the reducer, never by callers. */
  index: number;
}

export interface TextAnnotation extends AnnotationBase {
  kind: 'text';
  content: string;
}

export interface ArrowAnnotation extends AnnotationBase {
  kind: 'arrow';
  /** Offset of the arrow's tail from the anchored head point. */
  tail: AnchoredPoint;
}

export interface HighlightAnnotation extends AnnotationBase {
  kind: 'highlight';
}

export type Annotation = CalloutAnnotation | TextAnnotation | ArrowAnnotation | HighlightAnnotation;

export interface Changelog {
  id: string;
  url: string;
  title: string;
  capturedAt: number;
  annotations: Annotation[];
}

export type ChangelogAction =
  | { type: 'add'; annotation: Annotation }
  | { type: 'updateNote'; id: string; note: string }
  | { type: 'remove'; id: string }
  | { type: 'reorder'; from: number; to: number }
  | { type: 'replaceAll'; annotations: Annotation[] };

/**
 * Assign 1-based, contiguous indices to callouts in array order. Non-callout
 * annotations pass through untouched. This is the single source of truth for
 * callout numbering, re-run after every mutation.
 */
export function renumberCallouts(annotations: readonly Annotation[]): Annotation[] {
  let next = 1;
  return annotations.map((annotation) =>
    annotation.kind === 'callout' ? { ...annotation, index: next++ } : annotation,
  );
}

export function changelogReducer(changelog: Changelog, action: ChangelogAction): Changelog {
  switch (action.type) {
    case 'add': {
      return {
        ...changelog,
        annotations: renumberCallouts([...changelog.annotations, action.annotation]),
      };
    }

    case 'updateNote': {
      return {
        ...changelog,
        annotations: changelog.annotations.map((a) =>
          a.id === action.id ? { ...a, note: action.note } : a,
        ),
      };
    }

    case 'remove': {
      return {
        ...changelog,
        annotations: renumberCallouts(changelog.annotations.filter((a) => a.id !== action.id)),
      };
    }

    case 'reorder': {
      const annotations = [...changelog.annotations];
      const [moved] = annotations.splice(action.from, 1);
      if (moved === undefined) return changelog;
      annotations.splice(action.to, 0, moved);
      return { ...changelog, annotations: renumberCallouts(annotations) };
    }

    case 'replaceAll': {
      return { ...changelog, annotations: renumberCallouts(action.annotations) };
    }
  }
}
