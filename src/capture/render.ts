import type { ResolvedAnnotation } from '@/src/anchor';
import type { Point } from '@/src/core/model';

// Canvas rendering for compositing (SPEC §5.4): draw resolved (absolute)
// annotation geometry onto the screenshot. Written against a minimal
// `DrawContext` (a structural subset of CanvasRenderingContext2D) so the
// drawing logic is unit-testable with a recording stub. The overlay renders the
// same ResolvedAnnotations as SVG; this is the raster path for export.

export interface DrawContext {
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  save: () => void;
  restore: () => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  arc: (x: number, y: number, r: number, start: number, end: number) => void;
  fill: () => void;
  stroke: () => void;
  fillText: (text: string, x: number, y: number) => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  strokeRect: (x: number, y: number, w: number, h: number) => void;
}

export interface RenderOptions {
  strokeColor: string;
  strokeWidth: number;
  highlightColor: string;
  /** Multiplier from CSS pixels to screenshot pixels (devicePixelRatio). */
  scale: number;
  /**
   * Document-space offset (CSS px) added to viewport-relative coordinates before
   * scaling — the captured image's top-left in document space. `0`/unset for a
   * viewport capture; `{scrollX, scrollY}` for a full-page capture.
   */
  offsetX?: number;
  offsetY?: number;
}

const CALLOUT_RADIUS = 14;
const ARROWHEAD = 12;

// Viewport-relative coordinate → screenshot pixel: shift by the capture's document
// origin (offsetX/offsetY, 0 for a viewport capture) then scale by devicePixelRatio.
// Lengths (radii, font sizes, lineWidth) scale but are not shifted.
const px = (v: number, offset: number | undefined, scale: number): number =>
  (v + (offset ?? 0)) * scale;

function drawArrowhead(ctx: DrawContext, from: Point, to: Point, options: RenderOptions): void {
  const s = options.scale;
  // Angle is from raw (untranslated) coords — translation-invariant.
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const tipX = px(to.x, options.offsetX, s);
  const tipY = px(to.y, options.offsetY, s);
  const size = ARROWHEAD * s;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - size * Math.cos(angle - Math.PI / 6),
    tipY - size * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - size * Math.cos(angle + Math.PI / 6),
    tipY - size * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

export function drawResolved(
  ctx: DrawContext,
  annotation: ResolvedAnnotation,
  options: RenderOptions,
): void {
  const s = options.scale;
  const tx = (x: number): number => px(x, options.offsetX, s);
  const ty = (y: number): number => px(y, options.offsetY, s);
  ctx.save();
  ctx.strokeStyle = options.strokeColor;
  ctx.fillStyle = options.strokeColor;
  ctx.lineWidth = options.strokeWidth * s;

  switch (annotation.kind) {
    case 'callout': {
      ctx.beginPath();
      ctx.arc(tx(annotation.at.x), ty(annotation.at.y), CALLOUT_RADIUS * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `${String(Math.round(CALLOUT_RADIUS * 1.2 * s))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(annotation.index), tx(annotation.at.x), ty(annotation.at.y));
      break;
    }
    case 'text': {
      ctx.font = `${String(Math.round(16 * s))}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(annotation.content, tx(annotation.at.x), ty(annotation.at.y));
      break;
    }
    case 'arrow': {
      ctx.beginPath();
      ctx.moveTo(tx(annotation.from.x), ty(annotation.from.y));
      ctx.lineTo(tx(annotation.to.x), ty(annotation.to.y));
      ctx.stroke();
      drawArrowhead(ctx, annotation.from, annotation.to, options);
      break;
    }
    case 'highlight': {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = options.highlightColor;
      for (const rect of annotation.rects) {
        ctx.fillRect(tx(rect.x), ty(rect.y), rect.width * s, rect.height * s);
      }
      break;
    }
    case 'element': {
      const { rect } = annotation;
      ctx.strokeRect(tx(rect.x), ty(rect.y), rect.width * s, rect.height * s);
      break;
    }
  }

  ctx.restore();
}

export function drawScene(
  ctx: DrawContext,
  annotations: readonly ResolvedAnnotation[],
  options: RenderOptions,
): void {
  for (const annotation of annotations) drawResolved(ctx, annotation, options);
}
