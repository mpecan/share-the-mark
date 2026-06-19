import { describeRange, resolveGeometry } from '@/src/anchor';
import { computeSelector, type TargetRef } from '@/src/core/selector';
import {
  pointOffset,
  type AnchoredPoint,
  type Annotation,
  type Point,
  type TextAnchor,
  type ToolKind,
} from '@/src/core/model';
import { SVG_NS, SvgRenderer, type OverlaySettings } from './svg';
import { elementOf, PageHitTester } from './hit-test';
import {
  AnchorEditor,
  isDraggable,
  type EditableAnnotation,
  type EditHandle,
  type EditState,
} from './edit';

// Imperative drawing overlay controller (SPEC §5.1). Plain TypeScript, not React.
// It owns the DOM mount, the pointer-event state machine, annotation creation,
// and render orchestration, delegating the cohesive pieces to: SvgRenderer
// (geometry → SVG), PageHitTester (caret/element hit-testing), and AnchorEditor
// (drag → updated annotation, including re-anchoring on drop). Five tools —
// callout, text, arrow, highlight, element — plus the select tool (edit mode).

export type OverlayState = 'idle' | 'drawing' | 'editing' | 'placing-text';

const HANDLE_NAMES = new Set(['from', 'to', 'start', 'end']);

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

export class Overlay {
  private readonly doc: Document;
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly layer: SVGGElement;
  private readonly options: OverlayOptions;
  private readonly renderer: SvgRenderer;
  private readonly hitTester: PageHitTester;
  private readonly editor: AnchorEditor;
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
    this.renderer = new SvgRenderer(this.doc, options.settings);

    this.root = this.doc.createElement('div');
    this.root.dataset['stmOverlay'] = 'true';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:2147483646;touch-action:none;';

    this.svg = this.doc.createElementNS(SVG_NS, 'svg');
    this.svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;';
    this.svg.append(this.renderer.markerDefs());
    this.layer = this.doc.createElementNS(SVG_NS, 'g');
    this.svg.append(this.layer);

    this.root.append(this.svg);
    options.container.append(this.root);

    this.hitTester = new PageHitTester(this.root, this.doc, options);
    this.editor = new AnchorEditor(this.doc, this.hitTester);

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
    this.root.toggleAttribute('data-stm-edit', this.isEditing);
  }

  // The overlay is position:fixed/inset:0, so viewport coordinates map 1:1 — no
  // getBoundingClientRect (and its layout flush) needed per pointer event.
  private pointFrom(event: PointerEvent): Point {
    return { x: event.clientX, y: event.clientY };
  }

  private nextId(): string {
    return (this.options.createId ?? (() => crypto.randomUUID()))();
  }

  private timestamp(): number {
    return (this.options.now ?? (() => Date.now()))();
  }

  private ask(current: string): string | null {
    return (this.options.promptText ?? ((value) => prompt('Annotation text', value)))(current);
  }

  // The select tool is edit mode: marks are draggable and control handles show.
  private get isEditing(): boolean {
    return this.tool === 'select';
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
    if (this.isEditing) {
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
      const hovered = this.hitTester.pageElementAt(point);
      if (hovered !== this.hoveredElement) {
        this.hoveredElement = hovered;
        this.render();
      }
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.state === 'editing' && this.edit) {
      const edited = this.editor.editedAnnotation(
        { ...this.edit, current: this.pointFrom(event) },
        true,
      );
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
    if (!this.isEditing) return;
    const annotation = this.markUnder(event)?.annotation;
    if (annotation?.kind !== 'text') return;
    const note = this.ask(annotation.note ?? '');
    if (note !== null && note !== '') this.options.onUpdate?.({ ...annotation, note });
  };

  private readonly scheduleRender = (): void => {
    this.render();
  };

  // Offset (CSS px) from the anchored character's box to where the user clicked.
  private offsetFrom(range: Range, point: Point): AnchoredPoint {
    const box = range.getBoundingClientRect();
    return pointOffset(point, { x: box.left, y: box.top });
  }

  // The shared spine of every point-anchored mark (callout/text/arrow): hit-test
  // the caret under `point`, then build the common fields — target, text anchor,
  // and the offset of `point` from the anchored character's box. Returns null when
  // the point isn't over page text, so callers no-op. Per-kind extras (a callout's
  // index, the text note, an arrow's tail) are spread in by the caller.
  private pointAnchoredFields(
    point: Point,
  ): { target: TargetRef; anchor: TextAnchor; offset: AnchoredPoint } | null {
    const anchor = this.hitTester.caretAt(point);
    if (!anchor) return null;
    return {
      target: computeSelector(anchor.element),
      anchor: describeRange(anchor.element, anchor.range),
      offset: this.offsetFrom(anchor.range, point),
    };
  }

  private createCallout(point: Point): void {
    const fields = this.pointAnchoredFields(point);
    if (!fields) return;
    this.options.onCreate({
      id: this.nextId(),
      kind: 'callout',
      createdAt: this.timestamp(),
      index: 0,
      ...fields,
    });
  }

  private placeText(point: Point): void {
    const fields = this.pointAnchoredFields(point);
    if (!fields) return;
    this.state = 'placing-text';
    const note = this.ask('');
    this.state = 'idle';
    if (note === null || note === '') return;
    this.options.onCreate({
      id: this.nextId(),
      kind: 'text',
      createdAt: this.timestamp(),
      note,
      ...fields,
    });
  }

  private createElementComment(point: Point): void {
    const element = this.hitTester.pageElementAt(point);
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
    // The head (`to`) is the anchor point; the tail is stored relative to it.
    const fields = this.pointAnchoredFields(to);
    if (!fields) return;
    this.options.onCreate({
      id: this.nextId(),
      kind: 'arrow',
      createdAt: this.timestamp(),
      ...fields,
      tail: pointOffset(from, to),
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
  // The live preview uses the cheap offset delta (visually identical); the final
  // re-anchor (a caret hit-test) runs once on drop — see onPointerUp.
  private draftFor(annotation: Annotation): Annotation {
    const edit = this.edit;
    if (edit?.origin.id !== annotation.id) return annotation;
    return this.editor.editedAnnotation(edit, false);
  }

  private render(): void {
    this.layer.replaceChildren();
    for (const annotation of this.committed) {
      const resolved = resolveGeometry(this.draftFor(annotation), this.doc);
      if (!resolved) continue;
      const node = this.renderer.toSvg(resolved, this.isEditing);
      node.dataset['stmId'] = resolved.id;
      this.layer.append(node);
      // The text chip's background must be measured once the label is in the DOM.
      if (resolved.kind === 'text' && node instanceof SVGGElement) {
        this.renderer.sizeTextBackground(node);
      }
    }
    if (this.arrowDraft) {
      this.layer.append(this.renderer.arrowSvg(this.arrowDraft.from, this.arrowDraft.to));
    }
    if (this.tool === 'element' && this.hoveredElement) {
      const box = this.hoveredElement.getBoundingClientRect();
      this.layer.append(
        this.renderer.dashedRectSvg(
          { x: box.left, y: box.top, width: box.width, height: box.height },
          true,
        ),
      );
    }
  }
}
