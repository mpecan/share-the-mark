import { describe, expect, it } from 'vitest';
import { drawResolved, drawScene, type DrawContext, type RenderOptions } from '@/src/capture';
import type { ResolvedAnnotation } from '@/src/anchor';

interface Op {
  name: string;
  args: (number | string)[];
}

function recorder(): { ctx: DrawContext; ops: Op[] } {
  const ops: Op[] = [];
  const record =
    (name: string) =>
    (...args: (number | string)[]): void => {
      ops.push({ name, args });
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
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillText: record('fillText'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
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

describe('drawResolved', () => {
  it('draws a callout as a filled circle with its number, scaled', () => {
    const { ctx, ops } = recorder();
    drawResolved(ctx, { id: '1', kind: 'callout', index: 3, at: { x: 10, y: 20 } }, options);
    expect(names(ops)).toEqual(['save', 'beginPath', 'arc', 'fill', 'fillText', 'restore']);
    expect(ops.find((o) => o.name === 'arc')?.args.slice(0, 2)).toEqual([20, 40]);
    expect(ops.find((o) => o.name === 'fillText')?.args[0]).toBe('3');
  });

  it('draws free text at its scaled position', () => {
    const { ctx, ops } = recorder();
    drawResolved(ctx, { id: '1', kind: 'text', content: 'hi', at: { x: 5, y: 6 } }, options);
    expect(ops.find((o) => o.name === 'fillText')?.args).toEqual(['hi', 10, 12]);
  });

  it('draws an arrow with a head', () => {
    const { ctx, ops } = recorder();
    drawResolved(
      ctx,
      { id: '1', kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      options,
    );
    expect(names(ops).filter((n) => n === 'moveTo')).toHaveLength(3);
    expect(names(ops).filter((n) => n === 'lineTo')).toHaveLength(3);
  });

  it('strokes an element outline', () => {
    const { ctx, ops } = recorder();
    drawResolved(
      ctx,
      { id: '1', kind: 'element', rect: { x: 1, y: 2, width: 3, height: 4 } },
      options,
    );
    const strokeRect = ops.find((o) => o.name === 'strokeRect');
    expect(strokeRect?.args).toEqual([2, 4, 6, 8]); // scaled by 2
  });

  it('fills a translucent highlight per rect', () => {
    const { ctx, ops } = recorder();
    drawResolved(
      ctx,
      {
        id: '1',
        kind: 'highlight',
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
    const annotations: ResolvedAnnotation[] = [
      { id: '1', kind: 'callout', index: 1, at: { x: 0, y: 0 } },
      { id: '2', kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
    ];
    drawScene(ctx, annotations, options);
    expect(names(ops).filter((n) => n === 'restore')).toHaveLength(2);
  });
});
