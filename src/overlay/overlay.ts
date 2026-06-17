import type {
  Annotation,
  ArrowAnnotation,
  CalloutAnnotation,
  EllipseAnnotation,
  Point,
  RectangleAnnotation,
  TextAnnotation,
  ToolKind,
} from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';
import { drawScene, type DrawContext, type RenderOptions } from '@/src/capture';
import { buildAnnotationData, type Gesture } from './geometry';

type VectorAnnotation =
  | CalloutAnnotation
  | ArrowAnnotation
  | RectangleAnnotation
  | EllipseAnnotation
  | TextAnnotation;

const VECTOR_KINDS = new Set<ToolKind>(['callout', 'arrow', 'rectangle', 'ellipse', 'text']);

function isVector(annotation: Annotation): annotation is VectorAnnotation {
  return VECTOR_KINDS.has(annotation.kind);
}

// Imperative drawing overlay (SPEC §5.1). Plain TypeScript, not React: a
// pointer-event state machine over a <canvas> (raster: pencil, highlight) and
// an SVG layer (vector: callout, arrow, rectangle, ellipse, text). The
// committed annotation set is owned externally (the changelog); the overlay
// renders it plus the in-progress draft and emits creation events.

const SVG_NS = 'http://www.w3.org/2000/svg';

export type OverlayState = 'idle' | 'drawing' | 'editing' | 'placing-text';

export interface OverlayOptions {
  container: HTMLElement;
  tool: ToolKind;
  settings: RenderOptions;
  onCreate: (annotation: Annotation) => void;
  resolveTarget?: (point: Point) => TargetRef | undefined;
  createId?: () => string;
  now?: () => number;
  promptText?: (current: string) => string | null;
  getContext?: (canvas: HTMLCanvasElement) => DrawContext | null;
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
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: DrawContext | null;
  private readonly svg: SVGSVGElement;
  private readonly options: OverlayOptions;
  private tool: ToolKind;
  private state: OverlayState = 'idle';
  private gesture: Gesture | null = null;
  private committed: readonly Annotation[] = [];

  constructor(options: OverlayOptions) {
    this.options = options;
    this.tool = options.tool;
    this.doc = options.container.ownerDocument;

    this.root = this.doc.createElement('div');
    this.root.dataset['stmOverlay'] = 'true';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:2147483646;touch-action:none;';

    this.canvas = this.doc.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    this.svg = this.doc.createElementNS(SVG_NS, 'svg');
    this.svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;';

    this.root.append(this.canvas, this.svg);
    options.container.append(this.root);

    this.ctx = (options.getContext ?? ((c) => c.getContext('2d')))(this.canvas);

    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerup', this.onPointerUp);
    addEventListener('resize', this.onResize);
    this.resize();
  }

  // The canvas backing store must match the viewport (scaled by devicePixelRatio)
  // or raster tools (pencil, highlight) draw off-buffer and never appear.
  private resize(): void {
    const dpr = this.options.settings.scale || 1;
    const width = this.doc.documentElement.clientWidth;
    const height = this.doc.documentElement.clientHeight;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.render();
  }

  private readonly onResize = (): void => {
    this.resize();
  };

  get element(): HTMLElement {
    return this.root;
  }

  getState(): OverlayState {
    return this.state;
  }

  setTool(tool: ToolKind): void {
    this.tool = tool;
  }

  setAnnotations(annotations: readonly Annotation[]): void {
    this.committed = annotations;
    this.render();
  }

  destroy(): void {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    removeEventListener('resize', this.onResize);
    this.root.remove();
  }

  private pointFrom(event: PointerEvent): Point {
    const rect = this.root.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.state !== 'idle') return;
    const point = this.pointFrom(event);

    if (this.tool === 'text') {
      this.placeText(point);
      return;
    }
    if (this.tool === 'callout') {
      this.create('callout', { start: point, current: point, points: [point] });
      return;
    }

    this.state = 'drawing';
    this.gesture = { start: point, current: point, points: [point] };
    this.render();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.state !== 'drawing' || !this.gesture) return;
    const point = this.pointFrom(event);
    this.gesture.current = point;
    // Freeform pencil accumulates every sample; drag tools use start+current.
    if (this.tool === 'pencil') this.gesture.points.push(point);
    this.render();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.state !== 'drawing' || !this.gesture) return;
    const gesture: Gesture = { ...this.gesture, current: this.pointFrom(event) };
    this.state = 'idle';
    this.gesture = null;
    this.create(this.tool, gesture);
  };

  private placeText(point: Point): void {
    this.state = 'placing-text';
    const ask = this.options.promptText ?? ((current) => prompt('Annotation text', current));
    const content = ask('');
    this.state = 'idle';
    if (content === null || content === '') return;
    this.create('text', { start: point, current: point, points: [point] }, content);
  }

  private create(tool: ToolKind, gesture: Gesture, textContent?: string): void {
    const draft = buildAnnotationData(tool, gesture);
    const createId = this.options.createId ?? (() => crypto.randomUUID());
    const now = this.options.now ?? (() => Date.now());

    // The draft is one branch of the annotation union; reattach the runtime
    // fields and the optional target/anchor.
    const annotation: Annotation = { ...draft, id: createId(), createdAt: now() };
    if (textContent !== undefined && annotation.kind === 'text') annotation.content = textContent;

    const target = this.options.resolveTarget?.(gesture.start);
    if (target && annotation.kind !== 'pencil' && annotation.kind !== 'highlight') {
      annotation.target = target;
    }

    this.options.onCreate(annotation);
  }

  private render(): void {
    const draft = this.draftAnnotation();
    const all = draft ? [...this.committed, draft] : this.committed;

    this.svg.replaceChildren();
    for (const annotation of all) {
      if (isVector(annotation)) this.svg.append(this.toSvg(annotation));
    }

    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const raster = all.filter((a) => !isVector(a));
      // settings.scale carries devicePixelRatio so raster pixels land crisply.
      drawScene(this.ctx, raster, this.options.settings);
    }
  }

  private draftAnnotation(): Annotation | null {
    if (this.state !== 'drawing' || !this.gesture) return null;
    return { ...buildAnnotationData(this.tool, this.gesture), id: 'draft', createdAt: 0 };
  }

  private toSvg(annotation: VectorAnnotation): SVGElement {
    const stroke = this.options.settings.strokeColor;
    const width = String(this.options.settings.strokeWidth);
    switch (annotation.kind) {
      case 'callout': {
        const group = svgEl(this.doc, 'g', {});
        group.append(
          svgEl(this.doc, 'circle', {
            cx: String(annotation.anchor.x),
            cy: String(annotation.anchor.y),
            r: '14',
            fill: stroke,
          }),
        );
        const label = svgEl(this.doc, 'text', {
          x: String(annotation.anchor.x),
          y: String(annotation.anchor.y),
          fill: '#ffffff',
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        label.textContent = String(annotation.index);
        group.append(label);
        return group;
      }
      case 'arrow': {
        return svgEl(this.doc, 'line', {
          x1: String(annotation.from.x),
          y1: String(annotation.from.y),
          x2: String(annotation.to.x),
          y2: String(annotation.to.y),
          stroke,
          'stroke-width': width,
        });
      }
      case 'rectangle': {
        return svgEl(this.doc, 'rect', {
          x: String(annotation.rect.x),
          y: String(annotation.rect.y),
          width: String(annotation.rect.width),
          height: String(annotation.rect.height),
          fill: 'none',
          stroke,
          'stroke-width': width,
        });
      }
      case 'ellipse': {
        return svgEl(this.doc, 'ellipse', {
          cx: String(annotation.rect.x + annotation.rect.width / 2),
          cy: String(annotation.rect.y + annotation.rect.height / 2),
          rx: String(annotation.rect.width / 2),
          ry: String(annotation.rect.height / 2),
          fill: 'none',
          stroke,
          'stroke-width': width,
        });
      }
      case 'text': {
        const text = svgEl(this.doc, 'text', {
          x: String(annotation.position.x),
          y: String(annotation.position.y),
          fill: stroke,
        });
        text.textContent = annotation.content;
        return text;
      }
    }
  }
}
