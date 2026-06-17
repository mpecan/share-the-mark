import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  offsetsForRange,
  rangeFromOffsets,
  resolveGeometry,
  textOffset,
  toRect,
} from '@/src/anchor';
import type { Annotation } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  container.remove();
});

function targetFor(selector: string, tag: string): TargetRef {
  return { selector, fallbacks: [], tag, rect: { x: 0, y: 0, width: 0, height: 0 } };
}

describe('toRect', () => {
  it('copies the geometric fields', () => {
    expect(toRect({ x: 1, y: 2, width: 3, height: 4 } as DOMRect)).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
  });
});

describe('text offsets', () => {
  it('maps a (node, offset) position to a character offset', () => {
    container.innerHTML = '<p id="p">ab<span>cd</span>ef</p>';
    const p = container.querySelector('#p');
    if (!p) throw new Error('fixture missing');
    const cd = p.querySelector('span')?.firstChild;
    if (!cd) throw new Error('fixture missing');

    expect(textOffset(p, cd, 1)).toBe(3); // "ab" (2) + 1 into "cd"
  });

  it('clamps to the total when the container is not a text node', () => {
    container.innerHTML = '<p id="p">abcdef</p>';
    const p = container.querySelector('#p');
    if (!p) throw new Error('fixture missing');
    expect(textOffset(p, p, 0)).toBe(6);
  });

  it('round-trips a range built from offsets', () => {
    container.innerHTML = '<p id="p">ab<span>cd</span>ef</p>';
    const p = container.querySelector('#p');
    if (!p) throw new Error('fixture missing');

    const range = rangeFromOffsets(p, 1, 5);
    expect(range).not.toBeNull();
    if (range) expect(offsetsForRange(p, range)).toEqual({ start: 1, end: 5 });
  });

  it('returns null when an offset is out of range', () => {
    container.innerHTML = '<p id="p">abc</p>';
    const p = container.querySelector('#p');
    if (!p) throw new Error('fixture missing');
    expect(rangeFromOffsets(p, 0, 100)).toBeNull();
  });
});

describe('resolveGeometry', () => {
  it('returns null when the target cannot be resolved', () => {
    const annotation: Annotation = {
      id: '1',
      kind: 'callout',
      createdAt: 0,
      index: 1,
      at: { dx: 0, dy: 0 },
      target: targetFor('#missing', 'div'),
    };
    expect(resolveGeometry(annotation, document)).toBeNull();
  });

  it('resolves a callout to an absolute point offset from the element box', () => {
    container.innerHTML = '<div id="el"></div>';
    const annotation: Annotation = {
      id: '1',
      kind: 'callout',
      createdAt: 0,
      index: 2,
      at: { dx: 5, dy: 6 },
      target: targetFor('#el', 'div'),
    };
    expect(resolveGeometry(annotation, document)).toEqual({
      id: '1',
      kind: 'callout',
      index: 2,
      at: { x: 5, y: 6 },
    });
  });

  it('resolves text and arrow geometry', () => {
    container.innerHTML = '<div id="el"></div>';
    const text: Annotation = {
      id: 't',
      kind: 'text',
      createdAt: 0,
      content: 'hi',
      at: { dx: 1, dy: 2 },
      target: targetFor('#el', 'div'),
    };
    const arrow: Annotation = {
      id: 'a',
      kind: 'arrow',
      createdAt: 0,
      from: { dx: 0, dy: 0 },
      to: { dx: 10, dy: 4 },
      target: targetFor('#el', 'div'),
    };
    expect(resolveGeometry(text, document)).toMatchObject({
      kind: 'text',
      content: 'hi',
      at: { x: 1, y: 2 },
    });
    expect(resolveGeometry(arrow, document)).toMatchObject({
      kind: 'arrow',
      from: { x: 0, y: 0 },
      to: { x: 10, y: 4 },
    });
  });

  it('resolves a highlight to client rects', () => {
    container.innerHTML = '<p id="el">highlighted text</p>';
    const annotation: Annotation = {
      id: 'h',
      kind: 'highlight',
      createdAt: 0,
      startOffset: 0,
      endOffset: 11,
      quote: 'highlighted',
      target: targetFor('#el', 'p'),
    };
    const resolved = resolveGeometry(annotation, document);
    expect(resolved?.kind).toBe('highlight');
    if (resolved?.kind === 'highlight') expect(Array.isArray(resolved.rects)).toBe(true);
  });

  it('yields no rects when the highlight offsets are out of range', () => {
    container.innerHTML = '<p id="el">short</p>';
    const annotation: Annotation = {
      id: 'h',
      kind: 'highlight',
      createdAt: 0,
      startOffset: 0,
      endOffset: 999,
      quote: 'short',
      target: targetFor('#el', 'p'),
    };
    const resolved = resolveGeometry(annotation, document);
    expect(resolved).toMatchObject({ kind: 'highlight', rects: [] });
  });
});
