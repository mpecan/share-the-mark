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

describe('drawResolved with a capture offset (full-page)', () => {
  // Full-page capture: the image's top-left is the document origin, so coords are
  // shifted by the scroll offset before scaling — (coord + offset) * scale. Lengths
  // (radius, width, height) scale but are NOT shifted.
  const offsetOptions: RenderOptions = { ...options, offsetX: 100, offsetY: 200 };

  it('shifts a callout by the offset, then scales (radius unshifted)', () => {
    const { ctx, ops } = recorder();
    drawResolved(ctx, { id: '1', kind: 'callout', index: 3, at: { x: 10, y: 20 } }, offsetOptions);
    // (10 + 100) * 2 = 220, (20 + 200) * 2 = 440; radius 14 * 2 = 28 (no shift).
    expect(ops.find((o) => o.name === 'arc')?.args).toEqual([220, 440, 28, 0, Math.PI * 2]);
    expect(ops.find((o) => o.name === 'fillText')?.args).toEqual(['3', 220, 440]);
  });

  it('shifts free text by the offset', () => {
    const { ctx, ops } = recorder();
    drawResolved(ctx, { id: '1', kind: 'text', content: 'hi', at: { x: 5, y: 6 } }, offsetOptions);
    expect(ops.find((o) => o.name === 'fillText')?.args).toEqual(['hi', 210, 412]);
  });

  it('shifts arrow endpoints and the arrowhead tip', () => {
    const { ctx, ops } = recorder();
    drawResolved(
      ctx,
      { id: '1', kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      offsetOptions,
    );
    const moveTos = ops.filter((o) => o.name === 'moveTo');
    // Line start, then the two arrowhead strokes start at the (shifted) tip.
    expect(moveTos[0]?.args).toEqual([200, 400]);
    expect(moveTos[1]?.args).toEqual([220, 400]);
    expect(ops.find((o) => o.name === 'lineTo')?.args).toEqual([220, 400]);
  });

  it('shifts element/highlight rect origins but not their size', () => {
    const { ctx, ops } = recorder();
    drawResolved(
      ctx,
      { id: '1', kind: 'element', rect: { x: 1, y: 2, width: 3, height: 4 } },
      offsetOptions,
    );
    // (1 + 100) * 2 = 202, (2 + 200) * 2 = 404; size 3*2, 4*2 (no shift).
    expect(ops.find((o) => o.name === 'strokeRect')?.args).toEqual([202, 404, 6, 8]);

    const hl = recorder();
    drawResolved(
      hl.ctx,
      { id: '2', kind: 'highlight', rects: [{ x: 5, y: 5, width: 4, height: 2 }] },
      offsetOptions,
    );
    expect(hl.ops.find((o) => o.name === 'fillRect')?.args).toEqual([210, 410, 8, 4]);
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
