import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeRange, resolveGeometry, toRect } from '@/src/anchor';
import type { ArrowAnnotation, CalloutAnnotation, TextAnchor } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  container.innerHTML = '<p id="el">The quick brown fox</p>';
  document.body.append(container);
});

afterEach(() => {
  container.remove();
});

function targetFor(selector: string, tag: string): TargetRef {
  return { selector, fallbacks: [], tag, rect: { x: 0, y: 0, width: 0, height: 0 } };
}

function anchorFor(substring: string): TextAnchor {
  const node = container.querySelector('#el')?.firstChild;
  if (!node) throw new Error('fixture missing');
  const text = node as Text;
  const index = text.data.indexOf(substring);
  const range = document.createRange();
  range.setStart(text, index);
  range.setEnd(text, index + substring.length);
  const root = container.querySelector('#el');
  if (!root) throw new Error('fixture missing');
  return describeRange(root, range);
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

describe('resolveGeometry', () => {
  it('resolves a callout to a point at the anchored text', () => {
    const annotation: CalloutAnnotation = {
      id: '1',
      kind: 'callout',
      createdAt: 0,
      index: 2,
      target: targetFor('#el', 'p'),
      anchor: anchorFor('brown'),
      offset: { dx: 0, dy: 0 },
    };
    expect(resolveGeometry(annotation, document)).toMatchObject({ kind: 'callout', index: 2 });
  });

  it('offsets an arrow tail from the anchored head', () => {
    const annotation: ArrowAnnotation = {
      id: 'a',
      kind: 'arrow',
      createdAt: 0,
      target: targetFor('#el', 'p'),
      anchor: anchorFor('brown'),
      from: { dx: 3, dy: 4 },
      to: { dx: 0, dy: 0 },
    };
    expect(resolveGeometry(annotation, document)).toMatchObject({
      kind: 'arrow',
      from: { x: 3, y: 4 },
      to: { x: 0, y: 0 },
    });
  });

  it('resolves a highlight to client rects', () => {
    const annotation: CalloutAnnotation = {
      id: 'h',
      kind: 'callout',
      createdAt: 0,
      index: 1,
      target: targetFor('#el', 'p'),
      anchor: anchorFor('quick brown'),
      offset: { dx: 0, dy: 0 },
    };
    const resolved = resolveGeometry({ ...annotation, kind: 'highlight' }, document);
    expect(resolved?.kind).toBe('highlight');
  });

  it('returns null when the anchor text cannot be found', () => {
    const annotation: CalloutAnnotation = {
      id: '1',
      kind: 'callout',
      createdAt: 0,
      index: 1,
      target: targetFor('#el', 'p'),
      anchor: { start: 0, end: 5, exact: 'zzzzz', prefix: '', suffix: '' },
      offset: { dx: 0, dy: 0 },
    };
    expect(resolveGeometry(annotation, document)).toBeNull();
  });

  it('falls back to the document body when the target selector fails', () => {
    const annotation: CalloutAnnotation = {
      id: '1',
      kind: 'callout',
      createdAt: 0,
      index: 1,
      target: targetFor('#missing', 'p'),
      anchor: anchorFor('brown'),
      offset: { dx: 0, dy: 0 },
    };
    // body contains the same text, so it still resolves.
    expect(resolveGeometry(annotation, document)?.kind).toBe('callout');
  });
});
