import { describe, expect, it } from 'vitest';
import { buildAnnotationData, isDragTool, normalizeRect, type Gesture } from '@/src/overlay';

function gesture(
  start: [number, number],
  current: [number, number],
  points: [number, number][] = [],
): Gesture {
  return {
    start: { x: start[0], y: start[1] },
    current: { x: current[0], y: current[1] },
    points: points.map(([x, y]) => ({ x, y })),
  };
}

describe('normalizeRect', () => {
  it('normalizes regardless of drag direction', () => {
    expect(normalizeRect({ x: 50, y: 40 }, { x: 10, y: 10 })).toEqual({
      x: 10,
      y: 10,
      width: 40,
      height: 30,
    });
  });
});

describe('isDragTool', () => {
  it('classifies drag vs. non-drag tools', () => {
    expect(isDragTool('rectangle')).toBe(true);
    expect(isDragTool('arrow')).toBe(true);
    expect(isDragTool('highlight')).toBe(true);
    expect(isDragTool('callout')).toBe(false);
    expect(isDragTool('pencil')).toBe(false);
    expect(isDragTool('text')).toBe(false);
  });
});

describe('buildAnnotationData', () => {
  it('builds a callout at the start point', () => {
    expect(buildAnnotationData('callout', gesture([5, 6], [5, 6]))).toEqual({
      kind: 'callout',
      index: 0,
      anchor: { x: 5, y: 6 },
    });
  });

  it('builds a pencil path from sampled points', () => {
    const draft = buildAnnotationData(
      'pencil',
      gesture(
        [0, 0],
        [2, 2],
        [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      ),
    );
    expect(draft).toEqual({
      kind: 'pencil',
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    });
  });

  it('builds an arrow from start to current', () => {
    expect(buildAnnotationData('arrow', gesture([1, 1], [9, 4]))).toEqual({
      kind: 'arrow',
      from: { x: 1, y: 1 },
      to: { x: 9, y: 4 },
    });
  });

  it('builds a normalized rectangle and ellipse', () => {
    const rect = { x: 10, y: 10, width: 40, height: 30 };
    expect(buildAnnotationData('rectangle', gesture([50, 40], [10, 10]))).toEqual({
      kind: 'rectangle',
      rect,
    });
    expect(buildAnnotationData('ellipse', gesture([50, 40], [10, 10]))).toEqual({
      kind: 'ellipse',
      rect,
    });
  });

  it('builds an empty text box at the start point', () => {
    expect(buildAnnotationData('text', gesture([3, 4], [3, 4]))).toEqual({
      kind: 'text',
      position: { x: 3, y: 4 },
      content: '',
    });
  });

  it('builds a highlight rect', () => {
    expect(buildAnnotationData('highlight', gesture([0, 0], [10, 5]))).toEqual({
      kind: 'highlight',
      rects: [{ x: 0, y: 0, width: 10, height: 5 }],
    });
  });
});
