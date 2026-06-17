import { computeSelector } from '@/src/core/selector';
import { describeRange, resolveGeometry, type ResolvedAnnotation } from '@/src/anchor';
import type { Annotation, Point, ToolKind } from '@/src/core/model';

// Imperative drawing overlay (SPEC §5.1). Plain TypeScript, not React. SVG-only:
// annotations are content-anchored (text position + quote) and resolved to
// absolute geometry at render time, so marks track the content across
// scroll/resize/reflow. Four tools: callout (click), text (click + prompt),
// arrow (drag), highlight (native text selection).

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARROW_MARKER = 'stm-arrowhead';
const TEXT_PADDING = 4;

export type OverlayState = 'idle' | 'drawing' | 'editing' | 'placing-text';

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
  createId?: () => string;
  now?: () => number;
  promptText?: (current: string) => string | null;
  /** Convert a viewport point to a caret range in page text (injected for tests). */
  caretFromPoint?: (doc: Document, x: number, y: number) => Range | null;
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
    this.doc.removeEventListener('mouseup', this.onDocumentMouseUp);
    removeEventListener('scroll', this.scheduleRender, { capture: true });
    removeEventListener('resize', this.scheduleRender);
    this.mutationObserver.disconnect();
    this.resizeObserver?.disconnect();
    this.root.remove();
  }

  private applyToolPointerMode(): void {
    this.root.style.pointerEvents = this.tool === 'highlight' ? 'none' : 'auto';
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

  // Hit-test page text beneath the overlay by momentarily dropping our own
  // pointer-events, then anchor to the character at the caret.
  private caretAt(point: Point): { element: Element; range: Range } | undefined {
    const caretFromPoint = this.options.caretFromPoint ?? defaultCaretFromPoint;
    const host = this.hostElement();
    const previousRoot = this.root.style.pointerEvents;
    const previousHost = host?.style.pointerEvents;
    this.root.style.pointerEvents = 'none';
    if (host) host.style.pointerEvents = 'none';
    const caret = caretFromPoint(this.doc, point.x, point.y);
    this.root.style.pointerEvents = previousRoot;
    if (host) host.style.pointerEvents = previousHost ?? '';

    if (!caret) return undefined;
    const element = elementOf(caret.startContainer);
    if (!element || host?.contains(element) === true) return undefined;
    return { element, range: expandToChar(caret) };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.state !== 'idle') return;
    const point = this.pointFrom(event);
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
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.state !== 'drawing' || !this.arrowDraft) return;
    this.arrowDraft = { from: this.arrowDraft.from, to: this.pointFrom(event) };
    this.render();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
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

  private readonly scheduleRender = (): void => {
    this.render();
  };

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
    });
  }

  private createArrow(from: Point, to: Point): void {
    const anchor = this.caretAt(to);
    if (!anchor) return;
    const head = anchor.range.getBoundingClientRect();
    this.options.onCreate({
      id: this.nextId(),
      kind: 'arrow',
      createdAt: this.timestamp(),
      tail: { dx: from.x - head.left, dy: from.y - head.top },
      target: computeSelector(anchor.element),
      anchor: describeRange(anchor.element, anchor.range),
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

  private render(): void {
    this.layer.replaceChildren();
    for (const annotation of this.committed) {
      const resolved = resolveGeometry(annotation, this.doc);
      if (!resolved) continue;
      const node = this.toSvg(resolved);
      this.layer.append(node);
      // The text chip's background must be measured once the label is in the DOM.
      if (resolved.kind === 'text' && node instanceof SVGGElement) this.sizeTextBackground(node);
    }
    if (this.arrowDraft) {
      this.layer.append(this.arrowSvg(this.arrowDraft.from, this.arrowDraft.to));
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
        return this.arrowSvg(annotation.from, annotation.to);
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
        return group;
      }
    }
  }
}
