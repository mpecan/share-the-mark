import type { Point } from '@/src/core/model';

// Page hit-testing for the overlay: resolve a viewport point to the caret or
// element in the page *beneath* the overlay. The overlay (and its closed shadow
// host) are momentarily made non-interactive so the hit-test passes through.

export function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function defaultCaretFromPoint(doc: Document, x: number, y: number): Range | null {
  // The standard caretPositionFromPoint (supported in current Chromium and
  // Firefox); we deliberately avoid the deprecated caretRangeFromPoint.
  if (!('caretPositionFromPoint' in doc)) return null;
  const position = doc.caretPositionFromPoint(x, y);
  if (!position) return null;
  const range = doc.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

// Expand a collapsed caret to cover one character, so a point anchor carries a
// non-empty quote (disambiguated by its prefix/suffix context).
function expandToChar(caret: Range): Range {
  const range = caret.cloneRange();
  const node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    const length = (node as Text).data.length;
    if (range.startOffset < length) range.setEnd(node, range.startOffset + 1);
    else if (range.startOffset > 0) range.setStart(node, range.startOffset - 1);
  }
  return range;
}

export interface HitTestOptions {
  /** Convert a viewport point to a caret range in page text (injected for tests). */
  caretFromPoint?: (doc: Document, x: number, y: number) => Range | null;
  /** Resolve the topmost page element at a viewport point (injected for tests). */
  elementFromPoint?: (doc: Document, x: number, y: number) => Element | null;
}

export class PageHitTester {
  constructor(
    private readonly root: HTMLElement,
    private readonly doc: Document,
    private readonly options: HitTestOptions,
  ) {}

  // Caret in the page text under a point. Shared by point-tool creation and
  // highlight-handle editing.
  caretRangeAt(point: Point): Range | null {
    const caretFromPoint = this.options.caretFromPoint ?? defaultCaretFromPoint;
    return this.withPageHitTest((doc) => caretFromPoint(doc, point.x, point.y));
  }

  // Anchor to the character at the caret (point-tool creation + drop re-anchor).
  caretAt(point: Point): { element: Element; range: Range } | undefined {
    const caret = this.caretRangeAt(point);
    if (!caret) return undefined;
    const element = elementOf(caret.startContainer);
    if (!element || this.hostElement()?.contains(element) === true) return undefined;
    // A caret over non-text (whitespace, padding, a container element) lands on
    // an element node, which expandToChar can't grow — that yields an empty,
    // contextless TextAnchor that resolves to nowhere. Reject it so callers fall
    // back safely: creation no-ops, and a drop re-anchor keeps the prior anchor.
    const range = expandToChar(caret);
    if (range.collapsed) return undefined;
    return { element, range };
  }

  // Resolve the topmost page element under a point (skipping our own UI).
  pageElementAt(point: Point): Element | null {
    const resolve = this.options.elementFromPoint ?? ((doc, x, y) => doc.elementFromPoint(x, y));
    const element = this.withPageHitTest((doc) => resolve(doc, point.x, point.y));
    if (!element || this.hostElement()?.contains(element) === true) return null;
    return element;
  }

  private hostElement(): HTMLElement | null {
    const rootNode = this.root.getRootNode();
    return rootNode instanceof ShadowRoot && rootNode.host instanceof HTMLElement
      ? rootNode.host
      : null;
  }

  // Run a hit-test with our own UI made non-interactive, so points land on the
  // page beneath the overlay.
  private withPageHitTest<T>(hitTest: (doc: Document) => T): T {
    const host = this.hostElement();
    const previousRoot = this.root.style.pointerEvents;
    const previousHost = host?.style.pointerEvents;
    this.root.style.pointerEvents = 'none';
    if (host) host.style.pointerEvents = 'none';
    try {
      return hitTest(this.doc);
    } finally {
      this.root.style.pointerEvents = previousRoot;
      if (host) host.style.pointerEvents = previousHost ?? '';
    }
  }
}
