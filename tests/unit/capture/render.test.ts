import { describe, expect, it } from 'vitest';
import { drawAnnotation, drawScene, type DrawContext, type RenderOptions } from '@/src/capture';
import type { Annotation } from '@/src/core/model';

interface Op {
  name: string;
  args: number[] | string[];
}

function recorder(): { ctx: DrawContext; ops: Op[] } {
  const ops: Op[] = [];
  const record =
    (name: string) =>
    (...args: (number | string)[]): void => {
      ops.push({ name, args: args as number[] });
    };
  const ctx: DrawContext = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: record('save'),
    restore: record('restore'),
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    ellipse: record('ellipse'),
    rect: record('rect'),
    fillRect: record('fillRect'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillText: record('fillText'),
  };
  return { ctx, ops };
}

const options: RenderOptions = {
  strokeColor: '#e11d48',
  strokeWidth: 3,
  highlightColor: '#fde047',
  scale: 2,
};

function names(ops: Op[]): string[] {
  return ops.map((o) => o.name);
}

describe('drawAnnotation', () => {
  it('draws a callout as a filled circle with its number, scaled', () => {
    const { ctx, ops } = recorder();
    drawAnnotation(
      ctx,
      { id: '1', kind: 'callout', createdAt: 0, index: 3, anchor: { x: 10, y: 20 } },
      options,
    );
    expect(names(ops)).toEqual(['save', 'beginPath', 'arc', 'fill', 'fillText', 'restore']);
    const arc = ops.find((o) => o.name === 'arc');
    expect(arc?.args.slice(0, 2)).toEqual([20, 40]); // scaled by 2
    const text = ops.find((o) => o.name === 'fillText');
    expect(text?.args[0]).toBe('3');
  });

  it('strokes a pencil path point by point', () => {
    const { ctx, ops } = recorder();
    drawAnnotation(
      ctx,
      {
        id: '1',
        kind: 'pencil',
        createdAt: 0,
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      },
      options,
    );
    expect(names(ops).filter((n) => n === 'moveTo')).toHaveLength(1);
    expect(names(ops).filter((n) => n === 'lineTo')).toHaveLength(2);
  });

  it('draws an arrow with a head', () => {
    const { ctx, ops } = recorder();
    drawAnnotation(
      ctx,
      { id: '1', kind: 'arrow', createdAt: 0, from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      options,
    );
    // shaft (1 moveTo + 1 lineTo) + arrowhead (2 moveTo + 2 lineTo)
    expect(names(ops).filter((n) => n === 'moveTo')).toHaveLength(3);
    expect(names(ops).filter((n) => n === 'lineTo')).toHaveLength(3);
  });

  it('strokes a rectangle', () => {
    const { ctx, ops } = recorder();
    drawAnnotation(
      ctx,
      { id: '1', kind: 'rectangle', createdAt: 0, rect: { x: 1, y: 2, width: 3, height: 4 } },
      options,
    );
    expect(names(ops)).toContain('rect');
    expect(names(ops)).toContain('stroke');
  });

  it('strokes an ellipse centred in its rect', () => {
    const { ctx, ops } = recorder();
    drawAnnotation(
      ctx,
      { id: '1', kind: 'ellipse', createdAt: 0, rect: { x: 0, y: 0, width: 20, height: 10 } },
      options,
    );
    const ellipse = ops.find((o) => o.name === 'ellipse');
    expect(ellipse?.args.slice(0, 4)).toEqual([20, 10, 20, 10]); // center (10,5)*2, radii (10,5)*2
  });

  it('draws free text at its position', () => {
    const { ctx, ops } = recorder();
    drawAnnotation(
      ctx,
      { id: '1', kind: 'text', createdAt: 0, position: { x: 5, y: 6 }, content: 'hi' },
      options,
    );
    const text = ops.find((o) => o.name === 'fillText');
    expect(text?.args).toEqual(['hi', 10, 12]);
  });

  it('fills a translucent highlight per rect', () => {
    const { ctx, ops } = recorder();
    drawAnnotation(
      ctx,
      {
        id: '1',
        kind: 'highlight',
        createdAt: 0,
        rects: [
          { x: 0, y: 0, width: 4, height: 2 },
          { x: 5, y: 5, width: 4, height: 2 },
        ],
      },
      options,
    );
    expect(names(ops).filter((n) => n === 'fillRect')).toHaveLength(2);
  });
});

describe('drawScene', () => {
  it('draws every annotation', () => {
    const { ctx, ops } = recorder();
    const annotations: Annotation[] = [
      { id: '1', kind: 'callout', createdAt: 0, index: 1, anchor: { x: 0, y: 0 } },
      { id: '2', kind: 'rectangle', createdAt: 0, rect: { x: 0, y: 0, width: 1, height: 1 } },
    ];
    drawScene(ctx, annotations, options);
    expect(names(ops).filter((n) => n === 'restore')).toHaveLength(2);
  });
});
