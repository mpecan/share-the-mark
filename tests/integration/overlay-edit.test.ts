import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anchorOver,
  caretAt,
  container,
  created,
  elementCaret,
  findMark,
  makeOverlay,
  pointer,
  pointerOn,
  setupHarness,
  targetFor,
  teardownHarness,
  updated,
} from './overlay-harness';

beforeEach(setupHarness);
afterEach(teardownHarness);

describe('Overlay — editing', () => {
  it('never creates anything in select mode', () => {
    const overlay = makeOverlay({ tool: 'select' });
    pointer(overlay, 'pointerdown', 5, 5);
    pointer(overlay, 'pointerup', 5, 5);
    expect(created).toHaveLength(0);
  });

  it('moves a callout by dragging it (updates the offset)', () => {
    const overlay = makeOverlay({ tool: 'select' });
    overlay.setAnnotations([
      {
        id: 'c',
        kind: 'callout',
        createdAt: 0,
        index: 1,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
        offset: { dx: 10, dy: 10 },
      },
    ]);
    pointerOn(findMark('c'), 'pointerdown', 50, 50);
    expect(overlay.getState()).toBe('editing');
    pointer(overlay, 'pointermove', 70, 65);
    pointer(overlay, 'pointerup', 70, 65);
    expect(updated[0]).toMatchObject({ id: 'c', kind: 'callout', offset: { dx: 30, dy: 25 } });
  });

  it('re-anchors a moved callout to the text under the drop point', () => {
    const overlay = makeOverlay({ tool: 'select', caretFromPoint: () => caretAt(0) }); // 'T'
    overlay.setAnnotations([
      {
        id: 'c',
        kind: 'callout',
        createdAt: 0,
        index: 1,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
        offset: { dx: 0, dy: 0 },
      },
    ]);
    pointerOn(findMark('c'), 'pointerdown', 10, 10);
    pointer(overlay, 'pointermove', 40, 40);
    pointer(overlay, 'pointerup', 40, 40);
    // Anchor moved from 'brown' to the character now under the mark.
    expect(updated[0]).toMatchObject({ kind: 'callout', anchor: { exact: 'T' } });
  });

  it('keeps the original anchor when a mark is dropped off-text', () => {
    // Dropping over non-text resolves the caret to an element node; re-anchoring
    // must refuse (not produce an empty anchor) and keep the prior anchor.
    const original = anchorOver('quick');
    const overlay = makeOverlay({ tool: 'select', caretFromPoint: () => elementCaret() });
    overlay.setAnnotations([
      {
        id: 't',
        kind: 'text',
        createdAt: 0,
        note: 'hi',
        target: targetFor('#para', 'p'),
        anchor: original,
        offset: { dx: 0, dy: 0 },
      },
    ]);
    pointerOn(findMark('t'), 'pointerdown', 10, 10);
    pointer(overlay, 'pointermove', 40, 40);
    pointer(overlay, 'pointerup', 40, 40);
    // Re-anchor refused → original anchor preserved, only the offset shifts.
    expect(updated[0]).toMatchObject({
      kind: 'text',
      anchor: original,
      offset: { dx: 30, dy: 30 },
    });
  });

  it('re-anchors an arrow head when its handle is dragged', () => {
    const overlay = makeOverlay({ tool: 'select', caretFromPoint: () => caretAt(0) }); // 'T'
    overlay.setAnnotations([
      {
        id: 'a',
        kind: 'arrow',
        createdAt: 0,
        offset: { dx: 10, dy: 10 }, // the head
        tail: { dx: -10, dy: -10 }, // relative to the head
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
      },
    ]);
    const handle = container.querySelector(':scope [data-stm-handle="to"]');
    if (!handle) throw new Error('handle not found');
    pointerOn(handle, 'pointerdown', 30, 30);
    pointer(overlay, 'pointermove', 35, 38);
    pointer(overlay, 'pointerup', 35, 38);
    expect(updated[0]).toMatchObject({ kind: 'arrow', anchor: { exact: 'T' } });
  });

  it('keeps the original anchor when the drop point has no text', () => {
    const overlay = makeOverlay({ tool: 'select', caretFromPoint: () => null });
    overlay.setAnnotations([
      {
        id: 'c',
        kind: 'callout',
        createdAt: 0,
        index: 1,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
        offset: { dx: 5, dy: 5 },
      },
    ]);
    pointerOn(findMark('c'), 'pointerdown', 10, 10);
    pointer(overlay, 'pointermove', 20, 20);
    pointer(overlay, 'pointerup', 20, 20);
    // Falls back to a pure offset nudge; the text anchor is preserved.
    expect(updated[0]).toMatchObject({
      kind: 'callout',
      anchor: { exact: 'brown' },
      offset: { dx: 15, dy: 15 },
    });
  });

  it('drags an arrow endpoint handle', () => {
    const overlay = makeOverlay({ tool: 'select' });
    overlay.setAnnotations([
      {
        id: 'a',
        kind: 'arrow',
        createdAt: 0,
        offset: { dx: 10, dy: 10 }, // the head
        tail: { dx: -10, dy: -10 }, // relative to the head
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
      },
    ]);
    const handle = container.querySelector(':scope [data-stm-handle="to"]');
    if (!handle) throw new Error('handle not found');
    pointerOn(handle, 'pointerdown', 30, 30);
    pointer(overlay, 'pointermove', 35, 38);
    pointer(overlay, 'pointerup', 35, 38);
    // The head moved by (5,8); the tail stayed put, so its head-relative vector
    // counter-shifts. Absolute geometry: head (15,18), tail unchanged at (0,0).
    expect(updated[0]).toMatchObject({
      kind: 'arrow',
      offset: { dx: 15, dy: 18 },
      tail: { dx: -15, dy: -18 },
    });
  });

  it('drags the arrow tail without moving the anchored head', () => {
    const overlay = makeOverlay({ tool: 'select' });
    overlay.setAnnotations([
      {
        id: 'a',
        kind: 'arrow',
        createdAt: 0,
        offset: { dx: 10, dy: 10 }, // the head
        tail: { dx: -10, dy: -10 }, // relative to the head
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
      },
    ]);
    const handle = container.querySelector(':scope [data-stm-handle="from"]');
    if (!handle) throw new Error('handle not found');
    pointerOn(handle, 'pointerdown', 0, 0);
    pointer(overlay, 'pointermove', 5, 8);
    pointer(overlay, 'pointerup', 5, 8);
    // Only the tail vector moves; the head keeps its offset and its text anchor.
    expect(updated[0]).toMatchObject({
      kind: 'arrow',
      offset: { dx: 10, dy: 10 },
      tail: { dx: -5, dy: -2 },
      anchor: { exact: 'brown' },
    });
  });

  it('moves a whole arrow by dragging its line', () => {
    const overlay = makeOverlay({ tool: 'select' });
    overlay.setAnnotations([
      {
        id: 'a',
        kind: 'arrow',
        createdAt: 0,
        offset: { dx: 10, dy: 10 }, // the head
        tail: { dx: -10, dy: -10 }, // relative to the head
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
      },
    ]);
    const line = container.querySelector(':scope [data-stm-id="a"] line');
    if (!line) throw new Error('line not found');
    pointerOn(line, 'pointerdown', 20, 20);
    pointer(overlay, 'pointermove', 25, 27);
    pointer(overlay, 'pointerup', 25, 27);
    // Moving the whole arrow shifts the head; the tail rides along (its
    // head-relative vector is unchanged). Absolute: head (15,17), tail (5,7).
    expect(updated[0]).toMatchObject({
      kind: 'arrow',
      offset: { dx: 15, dy: 17 },
      tail: { dx: -10, dy: -10 },
    });
  });

  it('extends a highlight by dragging its end handle', () => {
    const spy = vi
      .spyOn(Range.prototype, 'getClientRects')
      .mockReturnValue([{ x: 0, y: 0, width: 10, height: 4 } as DOMRect] as unknown as DOMRectList);
    const overlay = makeOverlay({ tool: 'select', caretFromPoint: () => caretAt(19) }); // end of the text
    overlay.setAnnotations([
      {
        id: 'h',
        kind: 'highlight',
        createdAt: 0,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('quick'),
      },
    ]);
    const handle = container.querySelector(':scope [data-stm-handle="end"]');
    if (!handle) throw new Error('end handle not found');
    pointerOn(handle, 'pointerdown', 30, 30);
    pointer(overlay, 'pointermove', 60, 30);
    pointer(overlay, 'pointerup', 60, 30);
    expect(updated[0]).toMatchObject({ kind: 'highlight', anchor: { exact: 'quick brown fox' } });
    spy.mockRestore();
  });

  it('shrinks a highlight by dragging its start handle', () => {
    const spy = vi
      .spyOn(Range.prototype, 'getClientRects')
      .mockReturnValue([{ x: 0, y: 0, width: 10, height: 4 } as DOMRect] as unknown as DOMRectList);
    const overlay = makeOverlay({ tool: 'select', caretFromPoint: () => caretAt(0) }); // start of the text
    overlay.setAnnotations([
      {
        id: 'h',
        kind: 'highlight',
        createdAt: 0,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('quick'),
      },
    ]);
    const handle = container.querySelector(':scope [data-stm-handle="start"]');
    if (!handle) throw new Error('start handle not found');
    pointerOn(handle, 'pointerdown', 10, 10);
    pointer(overlay, 'pointermove', 0, 10);
    pointer(overlay, 'pointerup', 0, 10);
    expect(updated[0]).toMatchObject({ kind: 'highlight', anchor: { exact: 'The quick' } });
    spy.mockRestore();
  });

  it('leaves a highlight unchanged when the drag resolves no caret', () => {
    const spy = vi
      .spyOn(Range.prototype, 'getClientRects')
      .mockReturnValue([{ x: 0, y: 0, width: 10, height: 4 } as DOMRect] as unknown as DOMRectList);
    const overlay = makeOverlay({ tool: 'select', caretFromPoint: () => null });
    overlay.setAnnotations([
      {
        id: 'h',
        kind: 'highlight',
        createdAt: 0,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('quick'),
      },
    ]);
    const handle = container.querySelector(':scope [data-stm-handle="end"]');
    if (!handle) throw new Error('end handle not found');
    pointerOn(handle, 'pointerdown', 30, 30);
    pointer(overlay, 'pointerup', 40, 30);
    expect(updated[0]).toMatchObject({ kind: 'highlight', anchor: { exact: 'quick' } });
    spy.mockRestore();
  });

  it('leaves a highlight unchanged when the drag collapses the range', () => {
    const spy = vi
      .spyOn(Range.prototype, 'getClientRects')
      .mockReturnValue([{ x: 0, y: 0, width: 10, height: 4 } as DOMRect] as unknown as DOMRectList);
    // Dragging the end handle before the start collapses the range.
    const overlay = makeOverlay({ tool: 'select', caretFromPoint: () => caretAt(2) });
    overlay.setAnnotations([
      {
        id: 'h',
        kind: 'highlight',
        createdAt: 0,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('quick'),
      },
    ]);
    const handle = container.querySelector(':scope [data-stm-handle="end"]');
    if (!handle) throw new Error('end handle not found');
    pointerOn(handle, 'pointerdown', 30, 30);
    pointer(overlay, 'pointerup', 5, 30);
    expect(updated[0]).toMatchObject({ kind: 'highlight', anchor: { exact: 'quick' } });
    spy.mockRestore();
  });

  it('ignores double-clicks on non-text marks', () => {
    const overlay = makeOverlay({ tool: 'select' });
    overlay.setAnnotations([
      {
        id: 'c',
        kind: 'callout',
        createdAt: 0,
        index: 1,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
        offset: { dx: 0, dy: 0 },
      },
    ]);
    pointerOn(findMark('c'), 'dblclick', 0, 0);
    expect(updated).toHaveLength(0);
  });

  it('re-types a text annotation on double-click', () => {
    const overlay = makeOverlay({ tool: 'select', promptText: () => 'new content' });
    overlay.setAnnotations([
      {
        id: 't',
        kind: 'text',
        createdAt: 0,
        note: 'old',
        target: targetFor('#para', 'p'),
        anchor: anchorOver('quick'),
        offset: { dx: 0, dy: 0 },
      },
    ]);
    pointerOn(findMark('t'), 'dblclick', 0, 0);
    expect(updated[0]).toMatchObject({ id: 't', kind: 'text', note: 'new content' });
  });
});
