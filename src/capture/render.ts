import type { Annotation, Point } from '@/src/core/model';

// Canvas rendering for annotations — the drawing half of compositing (SPEC
// §5.4). Written against a minimal `DrawContext` (a structural subset of
// CanvasRenderingContext2D) so the full drawing logic is unit-testable with a
// recording stub; happy-dom has no real 2D canvas.

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
  ellipse: (
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
  ) => void;
  rect: (x: number, y: number, w: number, h: number) => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  stroke: () => void;
  fill: () => void;
  fillText: (text: string, x: number, y: number) => void;
}

export interface RenderOptions {
  strokeColor: string;
  strokeWidth: number;
  highlightColor: string;
  /** Multiplier from CSS pixels to screenshot pixels (devicePixelRatio). */
  scale: number;
}

const CALLOUT_RADIUS = 14;
const ARROWHEAD = 12;

function strokePath(ctx: DrawContext, points: readonly Point[], scale: number): void {
  ctx.beginPath();
  for (const [i, p] of points.entries()) {
    if (i === 0) ctx.moveTo(p.x * scale, p.y * scale);
    else ctx.lineTo(p.x * scale, p.y * scale);
  }
  ctx.stroke();
}

function drawArrowhead(ctx: DrawContext, from: Point, to: Point, scale: number): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const tipX = to.x * scale;
  const tipY = to.y * scale;
  const size = ARROWHEAD * scale;
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

export function drawAnnotation(
  ctx: DrawContext,
  annotation: Annotation,
  options: RenderOptions,
): void {
  const { scale } = options;
  ctx.save();
  ctx.strokeStyle = options.strokeColor;
  ctx.fillStyle = options.strokeColor;
  ctx.lineWidth = options.strokeWidth * scale;

  switch (annotation.kind) {
    case 'callout': {
      ctx.beginPath();
      ctx.arc(
        annotation.anchor.x * scale,
        annotation.anchor.y * scale,
        CALLOUT_RADIUS * scale,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `${String(Math.round(CALLOUT_RADIUS * 1.2 * scale))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        String(annotation.index),
        annotation.anchor.x * scale,
        annotation.anchor.y * scale,
      );
      break;
    }
    case 'pencil': {
      strokePath(ctx, annotation.path, scale);
      break;
    }
    case 'arrow': {
      strokePath(ctx, [annotation.from, annotation.to], scale);
      drawArrowhead(ctx, annotation.from, annotation.to, scale);
      break;
    }
    case 'rectangle': {
      const { rect } = annotation;
      ctx.beginPath();
      ctx.rect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      const { rect } = annotation;
      ctx.beginPath();
      ctx.ellipse(
        (rect.x + rect.width / 2) * scale,
        (rect.y + rect.height / 2) * scale,
        (rect.width / 2) * scale,
        (rect.height / 2) * scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;
    }
    case 'text': {
      ctx.font = `${String(Math.round(16 * scale))}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(
        annotation.content,
        annotation.position.x * scale,
        annotation.position.y * scale,
      );
      break;
    }
    case 'highlight': {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = options.highlightColor;
      for (const rect of annotation.rects) {
        ctx.fillRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
      }
      break;
    }
  }

  ctx.restore();
}

export function drawScene(
  ctx: DrawContext,
  annotations: readonly Annotation[],
  options: RenderOptions,
): void {
  for (const annotation of annotations) drawAnnotation(ctx, annotation, options);
}
