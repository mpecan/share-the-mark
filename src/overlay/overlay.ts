import { computeSelector, type TargetRef } from '@/src/core/selector';
import { offsetsForRange, resolveGeometry, type ResolvedAnnotation } from '@/src/anchor';
import type { Annotation, Point, ToolKind } from '@/src/core/model';

// Imperative drawing overlay (SPEC §5.1). Plain TypeScript, not React. SVG-only:
// every annotation is anchored to the DOM and resolved to absolute geometry at
// render time, so marks track the content across scroll/resize. Four tools:
// callout (click), text (click + prompt), arrow (drag), highlight (native text
// selection). The committed set is owned externally (the changelog).

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARROW_MARKER = 'stm-arrowhead';

export type OverlayState = 'idle' | 'drawing' | 'editing' | 'placing-text';

export interface OverlaySettings {
  strokeColor: string;
  strokeWidth: number;
  highlightColor: string;
}

export interface ResolvedTarget {
  target: TargetRef;
  element: Element;
}

export interface OverlayOptions {
  container: HTMLElement;
  tool: ToolKind;
  settings: OverlaySettings;
  onCreate: (annotation: Annotation) => void;
  /** Resolve the page element (and its selector) under a viewport point. */
  resolveTarget: (point: Point) => ResolvedTarget | undefined;
  createId?: () => string;
  now?: () => number;
  promptText?: (current: string) => string | null;
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

export class Overlay {
  private readonly doc: Document;
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly layer: SVGGElement;
  private readonly options: OverlayOptions;
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
    this.root.remove();
  }

  // The highlight tool needs native page selection, so the overlay must not
  // intercept pointer events while it is active.
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

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.state !== 'idle') return;
    const point = this.pointFrom(event);

    if (this.tool === 'text') {
      this.placeText(point);
      return;
    }
    if (this.tool === 'callout') {
      this.createPointMark('callout', point);
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

  private placeText(point: Point): void {
    const resolved = this.options.resolveTarget(point);
    if (!resolved) return;
    this.state = 'placing-text';
    const ask = this.options.promptText ?? ((current) => prompt('Annotation text', current));
    const content = ask('');
    this.state = 'idle';
    if (content === null || content === '') return;
    const at = offsetWithin(resolved.element, point);
    this.options.onCreate({
      id: this.nextId(),
      kind: 'text',
      createdAt: this.timestamp(),
      target: resolved.target,
      at,
      content,
    });
  }

  private createPointMark(kind: 'callout', point: Point): void {
    const resolved = this.options.resolveTarget(point);
    if (!resolved) return;
    const at = offsetWithin(resolved.element, point);
    this.options.onCreate({
      id: this.nextId(),
      kind,
      createdAt: this.timestamp(),
      target: resolved.target,
      index: 0,
      at,
    });
  }

  private createArrow(from: Point, to: Point): void {
    const resolved = this.options.resolveTarget(from);
    if (!resolved) return;
    this.options.onCreate({
      id: this.nextId(),
      kind: 'arrow',
      createdAt: this.timestamp(),
      target: resolved.target,
      from: offsetWithin(resolved.element, from),
      to: offsetWithin(resolved.element, to),
    });
  }

  private captureSelection(): void {
    const selection = this.doc.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const element = elementOf(range.commonAncestorContainer);
    if (!element || this.root.contains(element)) return;
    const offsets = offsetsForRange(element, range);
    this.options.onCreate({
      id: this.nextId(),
      kind: 'highlight',
      createdAt: this.timestamp(),
      target: computeSelector(element),
      startOffset: offsets.start,
      endOffset: offsets.end,
      quote: selection.toString(),
    });
    selection.removeAllRanges();
  }

  private render(): void {
    this.layer.replaceChildren();
    for (const annotation of this.committed) {
      const resolved = resolveGeometry(annotation, this.doc);
      if (resolved) this.layer.append(this.toSvg(resolved));
    }
    if (this.arrowDraft) {
      this.layer.append(this.arrowSvg(this.arrowDraft.from, this.arrowDraft.to));
    }
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
        const text = svgEl(this.doc, 'text', {
          x: String(annotation.at.x),
          y: String(annotation.at.y),
          fill: stroke,
          'dominant-baseline': 'hanging',
        });
        text.textContent = annotation.content;
        return text;
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

function offsetWithin(element: Element, point: Point): { dx: number; dy: number } {
  const rect = element.getBoundingClientRect();
  return { dx: point.x - rect.left, dy: point.y - rect.top };
}

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}
