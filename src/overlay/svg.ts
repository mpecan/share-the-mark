import type { ResolvedAnnotation } from '@/src/anchor';
import type { Point, Rect } from '@/src/core/model';

// SVG rendering for the overlay (SPEC §5.1): turn resolved (absolute) annotation
// geometry into SVG nodes. Holds only the document and stroke/highlight settings,
// so it carries no overlay state and is reusable in isolation.

export const SVG_NS = 'http://www.w3.org/2000/svg';
const ARROW_MARKER = 'stm-arrowhead';
const TEXT_PADDING = 4;

export interface OverlaySettings {
  strokeColor: string;
  strokeWidth: number;
  highlightColor: string;
}

type HandleName = 'from' | 'to' | 'start' | 'end';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  return el;
}

export class SvgRenderer {
  constructor(
    private readonly doc: Document,
    private readonly settings: OverlaySettings,
  ) {}

  markerDefs(): SVGDefsElement {
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
      svgEl(this.doc, 'path', { d: 'M0 0L10 5L0 10z', fill: this.settings.strokeColor }),
    );
    defs.append(marker);
    return defs;
  }

  arrowSvg(from: Point, to: Point): SVGElement {
    return svgEl(this.doc, 'line', {
      x1: String(from.x),
      y1: String(from.y),
      x2: String(to.x),
      y2: String(to.y),
      stroke: this.settings.strokeColor,
      'stroke-width': String(this.settings.strokeWidth),
      'marker-end': `url(#${ARROW_MARKER})`,
    });
  }

  // The dashed outline used for element comments and the element-hover preview.
  dashedRectSvg(box: Rect, isPreview = false): SVGElement {
    const rect = svgEl(this.doc, 'rect', {
      x: String(box.x),
      y: String(box.y),
      width: String(box.width),
      height: String(box.height),
      rx: '2',
      fill: 'none',
      stroke: this.settings.strokeColor,
      'stroke-width': String(this.settings.strokeWidth),
      'stroke-dasharray': '5 3',
    });
    if (isPreview) rect.setAttribute('stroke-opacity', '0.5');
    return rect;
  }

  // Size the text chip's background to its (now laid-out) label, once appended.
  sizeTextBackground(group: SVGGElement): void {
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

  private handleSvg(point: Point, handle: HandleName): SVGElement {
    const circle = svgEl(this.doc, 'circle', {
      cx: String(point.x),
      cy: String(point.y),
      r: '5',
      fill: this.settings.strokeColor,
      'fill-opacity': '0.6',
    });
    circle.dataset['stmHandle'] = handle;
    return circle;
  }

  toSvg(annotation: ResolvedAnnotation, isEditing: boolean): SVGElement {
    const stroke = this.settings.strokeColor;
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
        if (isEditing) {
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
              fill: this.settings.highlightColor,
              'fill-opacity': '0.35',
            }),
          );
        }
        // Handles at the start (first rect) and end (last rect) to re-anchor it,
        // shown only in edit mode.
        const first = annotation.rects[0];
        const last = annotation.rects.at(-1);
        if (isEditing && first) group.append(this.handleSvg({ x: first.x, y: first.y }, 'start'));
        if (isEditing && last) {
          group.append(this.handleSvg({ x: last.x + last.width, y: last.y + last.height }, 'end'));
        }
        return group;
      }
      case 'element': {
        return this.dashedRectSvg(annotation.rect);
      }
    }
  }
}
