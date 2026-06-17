import { computeSelector, resolveSelector } from '@/src/core/selector';
import { anchorRange, describeRange, resolveGeometry, type ResolvedAnnotation } from '@/src/anchor';
import type {
  Annotation,
  ArrowAnnotation,
  CalloutAnnotation,
  HighlightAnnotation,
  Point,
  TextAnnotation,
  ToolKind,
} from '@/src/core/model';

// Imperative drawing overlay (SPEC §5.1). Plain TypeScript, not React. SVG-only:
// annotations are content-anchored (text position + quote) and resolved to
// absolute geometry at render time, so marks track the content across
// scroll/resize/reflow. Five tools: callout, text, arrow, highlight, element.
// Existing marks are editable: drag to move (callout/text/arrow endpoints),
// double-click text to retype it.

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARROW_MARKER = 'stm-arrowhead';
const TEXT_PADDING = 4;

export type OverlayState = 'idle' | 'drawing' | 'editing' | 'placing-text';

type DraggableAnnotation = CalloutAnnotation | TextAnnotation | ArrowAnnotation;
type EditableAnnotation = DraggableAnnotation | HighlightAnnotation;
type EditHandle = 'from' | 'to' | 'start' | 'end' | 'move';

interface EditState {
  origin: EditableAnnotation;
  handle: EditHandle;
  start: Point;
  current: Point;
}

const DRAGGABLE_KINDS = new Set<ToolKind>(['callout', 'text', 'arrow']);
const HANDLE_NAMES = new Set(['from', 'to', 'start', 'end']);

function isDraggable(annotation: Annotation): annotation is DraggableAnnotation {
  return DRAGGABLE_KINDS.has(annotation.kind);
}

// Apply a drag delta to a draggable annotation: moving updates the offset(s);
// dragging an arrow endpoint updates just that endpoint. (Highlights re-anchor
// against the DOM instead — see Overlay.editedHighlight.)
function applyEdit(
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

export interface OverlaySettings {
  strokeColor: string;
  strokeWidth: number;
  highlightColor: string;
}

export interface OverlayOptions {
  container: HTMLElement;
  tool: ToolKind;
  settings: OverlaySettings;
  onCreate: (annotation: Annotation) => void;
  onUpdate?: (annotation: Annotation) => void;
  createId?: () => string;
  now?: () => number;
  promptText?: (current: string) => string | null;
  /** Convert a viewport point to a caret range in page text (injected for tests). */
  caretFromPoint?: (doc: Document, x: number, y: number) => Range | null;
  /** Resolve the topmost page element at a viewport point (injected for tests). */
  elementFromPoint?: (doc: Document, x: number, y: number) => Element | null;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  return el;
}

function elementOf(node: Node): Element | null {
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

export class Overlay {
  private readonly doc: Document;
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly layer: SVGGElement;
  private readonly options: OverlayOptions;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly mutationObserver: MutationObserver;
  private tool: ToolKind;
  private state: OverlayState = 'idle';
  private arrowDraft: { from: Point; to: Point } | null = null;
  private hoveredElement: Element | null = null;
  private edit: EditState | null = null;
  private committed: readonly Annotation[] = [];

  constructor(options: OverlayOptions) {
    this.options = options;
    this.tool = options.tool;
    this.doc = options.container.ownerDocument;

    this.root = this.doc.createElement('div');
    this.root.dataset['stmOverlay'] = 'true';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:2147483646;touch-action:none;';

    this.svg = this.doc.createElementNS(SVG_NS, 'svg');
    this.svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;';
    this.svg.append(this.arrowMarkerDefs());
    this.layer = this.doc.createElementNS(SVG_NS, 'g');
    this.svg.append(this.layer);

    this.root.append(this.svg);
    options.container.append(this.root);

    this.applyToolPointerMode();

    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerup', this.onPointerUp);
    this.root.addEventListener('dblclick', this.onDoubleClick);
    this.doc.addEventListener('mouseup', this.onDocumentMouseUp);
    addEventListener('scroll', this.scheduleRender, { capture: true, passive: true });
    addEventListener('resize', this.scheduleRender);

    // Recompute positions when the page layout or content changes.
    this.mutationObserver = new MutationObserver(this.scheduleRender);
    this.mutationObserver.observe(this.doc.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.scheduleRender);
    this.resizeObserver?.observe(this.doc.documentElement);
  }

  get element(): HTMLElement {
    return this.root;
  }

  getState(): OverlayState {
    return this.state;
  }

  setTool(tool: ToolKind): void {
    this.tool = tool;
    this.arrowDraft = null;
    this.hoveredElement = null;
    this.state = 'idle';
    this.applyToolPointerMode();
    this.render();
  }

  setAnnotations(annotations: readonly Annotation[]): void {
    this.committed = annotations;
    this.render();
  }

  destroy(): void {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('dblclick', this.onDoubleClick);
    this.doc.removeEventListener('mouseup', this.onDocumentMouseUp);
    removeEventListener('scroll', this.scheduleRender, { capture: true });
    removeEventListener('resize', this.scheduleRender);
    this.mutationObserver.disconnect();
    this.resizeObserver?.disconnect();
    this.root.remove();
  }

  private applyToolPointerMode(): void {
    this.root.style.pointerEvents = this.tool === 'highlight' ? 'none' : 'auto';
    // Drives cursor feedback (panel.css) and signals that handles are live.
    this.root.toggleAttribute('data-stm-edit', this.tool === 'select');
  }

  private pointFrom(event: PointerEvent): Point {
    const rect = this.root.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private nextId(): string {
    return (this.options.createId ?? (() => crypto.randomUUID()))();
  }

  private timestamp(): number {
    return (this.options.now ?? (() => Date.now()))();
  }

  private hostElement(): HTMLElement | null {
    const rootNode = this.root.getRootNode();
    return rootNode instanceof ShadowRoot && rootNode.host instanceof HTMLElement
      ? rootNode.host
      : null;
  }

  // Caret in the page text under a point, hit-tested with our own UI made
  // non-interactive so the caret lands on the page (not the overlay). Shared by
  // point-tool creation and highlight-handle editing.
  private caretRangeAt(point: Point): Range | null {
    const caretFromPoint = this.options.caretFromPoint ?? defaultCaretFromPoint;
    const host = this.hostElement();
    const previousRoot = this.root.style.pointerEvents;
    const previousHost = host?.style.pointerEvents;
    this.root.style.pointerEvents = 'none';
    if (host) host.style.pointerEvents = 'none';
    const caret = caretFromPoint(this.doc, point.x, point.y);
    this.root.style.pointerEvents = previousRoot;
    if (host) host.style.pointerEvents = previousHost ?? '';
    return caret;
  }

  // Anchor to the character at the caret (point-tool creation).
  private caretAt(point: Point): { element: Element; range: Range } | undefined {
    const caret = this.caretRangeAt(point);
    if (!caret) return undefined;
    const element = elementOf(caret.startContainer);
    if (!element || this.hostElement()?.contains(element) === true) return undefined;
    return { element, range: expandToChar(caret) };
  }

  // Resolve the topmost page element under a point (skipping our own UI).
  private pageElementAt(point: Point): Element | null {
    const resolve = this.options.elementFromPoint ?? ((doc, x, y) => doc.elementFromPoint(x, y));
    const host = this.hostElement();
    const previousRoot = this.root.style.pointerEvents;
    const previousHost = host?.style.pointerEvents;
    this.root.style.pointerEvents = 'none';
    if (host) host.style.pointerEvents = 'none';
    const element = resolve(this.doc, point.x, point.y);
    this.root.style.pointerEvents = previousRoot;
    if (host) host.style.pointerEvents = previousHost ?? '';
    if (!element || host?.contains(element) === true) return null;
    return element;
  }

  // Find the existing mark (and arrow handle, if any) under an event.
  private markUnder(event: Event): { annotation: EditableAnnotation; handle: EditHandle } | null {
    const target = event.target;
    if (!(target instanceof SVGElement)) return null;
    const markEl = target.closest('[data-stm-id]');
    if (!(markEl instanceof SVGElement)) return null;
    const annotation = this.committed.find((a) => a.id === markEl.dataset['stmId']);
    if (!annotation) return null;
    const attr = target.dataset['stmHandle'];
    const handle: EditHandle =
      attr !== undefined && HANDLE_NAMES.has(attr) ? (attr as EditHandle) : 'move';
    // Highlights are only editable via their start/end handles (re-anchoring the
    // text range); their body isn't draggable. The rest move/resize freely.
    if (annotation.kind === 'highlight') {
      return handle === 'start' || handle === 'end' ? { annotation, handle } : null;
    }
    return isDraggable(annotation) ? { annotation, handle } : null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.state !== 'idle') return;
    const point = this.pointFrom(event);

    // The select tool edits existing marks and never creates new ones.
    if (this.tool === 'select') {
      const hit = this.markUnder(event);
      if (hit) {
        this.edit = { origin: hit.annotation, handle: hit.handle, start: point, current: point };
        this.state = 'editing';
        this.render();
      }
      return;
    }

    if (this.tool === 'text') {
      this.placeText(point);
      return;
    }
    if (this.tool === 'callout') {
      this.createCallout(point);
      return;
    }
    if (this.tool === 'arrow') {
      this.state = 'drawing';
      this.arrowDraft = { from: point, to: point };
      this.render();
      return;
    }
    if (this.tool === 'element') {
      this.createElementComment(point);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const point = this.pointFrom(event);
    if (this.state === 'editing' && this.edit) {
      this.edit = { ...this.edit, current: point };
      this.render();
      return;
    }
    if (this.state === 'drawing' && this.arrowDraft) {
      this.arrowDraft = { from: this.arrowDraft.from, to: point };
      this.render();
      return;
    }
    if (this.tool === 'element' && this.state === 'idle') {
      const hovered = this.pageElementAt(point);
      if (hovered !== this.hoveredElement) {
        this.hoveredElement = hovered;
        this.render();
      }
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.state === 'editing' && this.edit) {
      const edited = this.computeEdit({ ...this.edit, current: this.pointFrom(event) });
      this.state = 'idle';
      this.edit = null;
      this.options.onUpdate?.(edited);
      return;
    }
    if (this.state !== 'drawing' || !this.arrowDraft) return;
    const from = this.arrowDraft.from;
    const to = this.pointFrom(event);
    this.state = 'idle';
    this.arrowDraft = null;
    this.createArrow(from, to);
  };

  private readonly onDocumentMouseUp = (): void => {
    if (this.tool !== 'highlight') return;
    this.captureSelection();
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (this.tool !== 'select') return;
    const target = event.target;
    if (!(target instanceof SVGElement)) return;
    const markEl = target.closest('[data-stm-id]');
    const id = markEl instanceof SVGElement ? markEl.dataset['stmId'] : undefined;
    const annotation = this.committed.find((a) => a.id === id);
    if (annotation?.kind !== 'text') return;
    const ask = this.options.promptText ?? ((current) => prompt('Annotation text', current));
    const content = ask(annotation.content);
    if (content !== null && content !== '') this.options.onUpdate?.({ ...annotation, content });
  };

  private readonly scheduleRender = (): void => {
    this.render();
  };

  // Offset (CSS px) from the anchored character's box to where the user clicked.
  private offsetFrom(range: Range, point: Point): { dx: number; dy: number } {
    const box = range.getBoundingClientRect();
    return { dx: point.x - box.left, dy: point.y - box.top };
  }

  private createCallout(point: Point): void {
    const anchor = this.caretAt(point);
    if (!anchor) return;
    this.options.onCreate({
      id: this.nextId(),
      kind: 'callout',
      createdAt: this.timestamp(),
      index: 0,
      target: computeSelector(anchor.element),
      anchor: describeRange(anchor.element, anchor.range),
      offset: this.offsetFrom(anchor.range, point),
    });
  }

  private placeText(point: Point): void {
    const anchor = this.caretAt(point);
    if (!anchor) return;
    this.state = 'placing-text';
    const ask = this.options.promptText ?? ((current) => prompt('Annotation text', current));
    const content = ask('');
    this.state = 'idle';
    if (content === null || content === '') return;
    this.options.onCreate({
      id: this.nextId(),
      kind: 'text',
      createdAt: this.timestamp(),
      content,
      target: computeSelector(anchor.element),
      anchor: describeRange(anchor.element, anchor.range),
      offset: this.offsetFrom(anchor.range, point),
    });
  }

  private createElementComment(point: Point): void {
    const element = this.pageElementAt(point);
    if (!element) return;
    this.hoveredElement = null;
    this.options.onCreate({
      id: this.nextId(),
      kind: 'element',
      createdAt: this.timestamp(),
      target: computeSelector(element),
    });
  }

  private createArrow(from: Point, to: Point): void {
    const anchor = this.caretAt(to);
    if (!anchor) return;
    this.options.onCreate({
      id: this.nextId(),
      kind: 'arrow',
      createdAt: this.timestamp(),
      target: computeSelector(anchor.element),
      anchor: describeRange(anchor.element, anchor.range),
      from: this.offsetFrom(anchor.range, from),
      to: this.offsetFrom(anchor.range, to),
    });
  }

  private captureSelection(): void {
    const selection = this.doc.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const element = elementOf(range.commonAncestorContainer);
    if (!element || this.root.contains(element)) return;
    this.options.onCreate({
      id: this.nextId(),
      kind: 'highlight',
      createdAt: this.timestamp(),
      target: computeSelector(element),
      anchor: describeRange(element, range),
    });
    selection.removeAllRanges();
  }

  // Substitute the in-progress edit for its committed annotation while dragging.
  private draftFor(annotation: Annotation): Annotation {
    const edit = this.edit;
    if (edit?.origin.id !== annotation.id) return annotation;
    return this.computeEdit(edit);
  }

  private computeEdit(edit: EditState): Annotation {
    if (edit.origin.kind === 'highlight')
      return this.editedHighlight(edit.origin, edit) ?? edit.origin;
    return applyEdit(
      edit.origin,
      edit.current.x - edit.start.x,
      edit.current.y - edit.start.y,
      edit.handle,
    );
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
    const caret = this.caretRangeAt(edit.current);
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

  private render(): void {
    this.layer.replaceChildren();
    for (const annotation of this.committed) {
      const resolved = resolveGeometry(this.draftFor(annotation), this.doc);
      if (!resolved) continue;
      const node = this.toSvg(resolved);
      node.dataset['stmId'] = resolved.id;
      this.layer.append(node);
      // The text chip's background must be measured once the label is in the DOM.
      if (resolved.kind === 'text' && node instanceof SVGGElement) this.sizeTextBackground(node);
    }
    if (this.arrowDraft) {
      this.layer.append(this.arrowSvg(this.arrowDraft.from, this.arrowDraft.to));
    }
    if (this.tool === 'element' && this.hoveredElement) {
      const box = this.hoveredElement.getBoundingClientRect();
      this.layer.append(
        svgEl(this.doc, 'rect', {
          x: String(box.left),
          y: String(box.top),
          width: String(box.width),
          height: String(box.height),
          rx: '2',
          fill: 'none',
          stroke: this.options.settings.strokeColor,
          'stroke-width': String(this.options.settings.strokeWidth),
          'stroke-dasharray': '5 3',
          'stroke-opacity': '0.5',
        }),
      );
    }
  }

  private sizeTextBackground(group: SVGGElement): void {
    const label = group.querySelector('text');
    const background = group.querySelector('rect');
    if (!label || !background) return;
    let box: DOMRect;
    try {
      box = label.getBBox();
    } catch {
      return; // no layout engine (e.g. tests) — leave the background unsized
    }
    background.setAttribute('x', String(box.x - TEXT_PADDING));
    background.setAttribute('y', String(box.y - TEXT_PADDING));
    background.setAttribute('width', String(box.width + TEXT_PADDING * 2));
    background.setAttribute('height', String(box.height + TEXT_PADDING * 2));
  }

  private arrowMarkerDefs(): SVGDefsElement {
    const defs = this.doc.createElementNS(SVG_NS, 'defs');
    const marker = svgEl(this.doc, 'marker', {
      id: ARROW_MARKER,
      viewBox: '0 0 10 10',
      refX: '8',
      refY: '5',
      markerWidth: '7',
      markerHeight: '7',
      orient: 'auto-start-reverse',
    });
    marker.append(
      svgEl(this.doc, 'path', { d: 'M0 0L10 5L0 10z', fill: this.options.settings.strokeColor }),
    );
    defs.append(marker);
    return defs;
  }

  private handleSvg(point: Point, handle: 'from' | 'to' | 'start' | 'end'): SVGElement {
    const circle = svgEl(this.doc, 'circle', {
      cx: String(point.x),
      cy: String(point.y),
      r: '5',
      fill: this.options.settings.strokeColor,
      'fill-opacity': '0.6',
    });
    circle.dataset['stmHandle'] = handle;
    return circle;
  }

  private arrowSvg(from: Point, to: Point): SVGElement {
    return svgEl(this.doc, 'line', {
      x1: String(from.x),
      y1: String(from.y),
      x2: String(to.x),
      y2: String(to.y),
      stroke: this.options.settings.strokeColor,
      'stroke-width': String(this.options.settings.strokeWidth),
      'marker-end': `url(#${ARROW_MARKER})`,
    });
  }

  private toSvg(annotation: ResolvedAnnotation): SVGElement {
    const stroke = this.options.settings.strokeColor;
    switch (annotation.kind) {
      case 'callout': {
        const group = svgEl(this.doc, 'g', {});
        group.append(
          svgEl(this.doc, 'circle', {
            cx: String(annotation.at.x),
            cy: String(annotation.at.y),
            r: '14',
            fill: stroke,
          }),
        );
        const label = svgEl(this.doc, 'text', {
          x: String(annotation.at.x),
          y: String(annotation.at.y),
          fill: '#ffffff',
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        label.textContent = String(annotation.index);
        group.append(label);
        return group;
      }
      case 'text': {
        // A chip: a background rect (for legibility over busy backgrounds) plus
        // the label. The background goes transparent on hover (see panel.css).
        const group = svgEl(this.doc, 'g', { class: 'stm-text' });
        const background = svgEl(this.doc, 'rect', {
          class: 'stm-text__bg',
          rx: '3',
          fill: stroke,
        });
        const label = svgEl(this.doc, 'text', {
          class: 'stm-text__label',
          x: String(annotation.at.x + TEXT_PADDING),
          y: String(annotation.at.y + TEXT_PADDING),
          fill: '#ffffff',
          'dominant-baseline': 'hanging',
        });
        label.textContent = annotation.content;
        group.append(background, label);
        return group;
      }
      case 'arrow': {
        const group = svgEl(this.doc, 'g', {});
        group.append(this.arrowSvg(annotation.from, annotation.to));
        if (this.tool === 'select') {
          group.append(this.handleSvg(annotation.from, 'from'));
          group.append(this.handleSvg(annotation.to, 'to'));
        }
        return group;
      }
      case 'highlight': {
        const group = svgEl(this.doc, 'g', {});
        for (const rect of annotation.rects) {
          group.append(
            svgEl(this.doc, 'rect', {
              x: String(rect.x),
              y: String(rect.y),
              width: String(rect.width),
              height: String(rect.height),
              fill: this.options.settings.highlightColor,
              'fill-opacity': '0.35',
            }),
          );
        }
        // Handles at the start (first rect) and end (last rect) to re-anchor it,
        // shown only in the select (edit) tool.
        const first = annotation.rects[0];
        const last = annotation.rects.at(-1);
        if (this.tool === 'select' && first) {
          group.append(this.handleSvg({ x: first.x, y: first.y }, 'start'));
        }
        if (this.tool === 'select' && last) {
          group.append(this.handleSvg({ x: last.x + last.width, y: last.y + last.height }, 'end'));
        }
        return group;
      }
      case 'element': {
        return svgEl(this.doc, 'rect', {
          x: String(annotation.rect.x),
          y: String(annotation.rect.y),
          width: String(annotation.rect.width),
          height: String(annotation.rect.height),
          rx: '2',
          fill: 'none',
          stroke,
          'stroke-width': String(this.options.settings.strokeWidth),
          'stroke-dasharray': '5 3',
        });
      }
    }
  }
}
