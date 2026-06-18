import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Overlay } from '@/src/overlay';
import {
  anchorOver,
  caretAt,
  container,
  created,
  elementCaret,
  makeOverlay,
  para,
  pointer,
  settings,
  setupHarness,
  targetFor,
  teardownHarness,
} from './overlay-harness';

// Overlay creation + rendering. Editing/drag behaviour lives in
// overlay-edit.test.ts; shared fixture and helpers in overlay-harness.ts.

beforeEach(setupHarness);
afterEach(teardownHarness);

describe('Overlay — mounting', () => {
  it('mounts an svg layer and removes itself on destroy', () => {
    const overlay = makeOverlay();
    expect(container.querySelector(':scope [data-stm-overlay] svg')).not.toBeNull();
    overlay.destroy();
    expect(container.querySelector('[data-stm-overlay]')).toBeNull();
  });
});

describe('Overlay — click tools', () => {
  it('creates a callout anchored to the character at the caret', () => {
    const overlay = makeOverlay({ tool: 'callout' });
    pointer(overlay, 'pointerdown', 30, 40);
    expect(created[0]).toMatchObject({
      kind: 'callout',
      index: 0,
      id: 'id-1',
      createdAt: 1000,
      target: { selector: '#para' },
      anchor: { exact: 'q' },
      // Offset from the anchored char box (0 in happy-dom) to the click point.
      offset: { dx: 30, dy: 40 },
    });
    expect(overlay.getState()).toBe('idle');
  });

  it('creates a text annotation from the prompt', () => {
    const overlay = makeOverlay({ tool: 'text', promptText: () => 'hello' });
    pointer(overlay, 'pointerdown', 5, 6);
    expect(created[0]).toMatchObject({ kind: 'text', note: 'hello', anchor: { exact: 'q' } });
  });

  it('skips text creation when the prompt is cancelled', () => {
    const overlay = makeOverlay({ tool: 'text', promptText: () => null });
    pointer(overlay, 'pointerdown', 5, 5);
    expect(created).toHaveLength(0);
  });

  it('does not anchor when the caret lands on non-text (an element node)', () => {
    // caretPositionFromPoint over whitespace/padding resolves to an element node,
    // which can't expand to a character — that would yield an empty anchor.
    const overlay = makeOverlay({
      tool: 'text',
      promptText: () => 'hi',
      caretFromPoint: () => elementCaret(),
    });
    pointer(overlay, 'pointerdown', 5, 6);
    expect(created).toHaveLength(0);
  });

  it('does not create when no caret resolves', () => {
    const overlay = makeOverlay({ tool: 'callout', caretFromPoint: () => null });
    pointer(overlay, 'pointerdown', 1, 1);
    expect(created).toHaveLength(0);
  });

  it('uses the default caret resolver when none is injected', () => {
    // happy-dom has no caretPositionFromPoint, so the default resolves to null.
    const overlay = new Overlay({
      container,
      tool: 'callout',
      settings,
      onCreate: (a) => {
        created.push(a);
      },
    });
    pointer(overlay, 'pointerdown', 1, 1);
    expect(created).toHaveLength(0);
  });
});

describe('Overlay — arrow', () => {
  it('anchors to the head char and stores both endpoint offsets', () => {
    const overlay = makeOverlay({ tool: 'arrow' });
    pointer(overlay, 'pointerdown', 10, 10);
    expect(overlay.getState()).toBe('drawing');
    pointer(overlay, 'pointermove', 40, 30);
    pointer(overlay, 'pointerup', 40, 30);
    expect(overlay.getState()).toBe('idle');
    expect(created[0]).toMatchObject({
      kind: 'arrow',
      from: { dx: 10, dy: 10 },
      to: { dx: 40, dy: 30 },
      anchor: { exact: 'q' },
    });
  });

  it('ignores stray move/up events when idle', () => {
    const overlay = makeOverlay({ tool: 'arrow' });
    pointer(overlay, 'pointermove', 5, 5);
    pointer(overlay, 'pointerup', 5, 5);
    expect(created).toHaveLength(0);
  });
});

describe('Overlay — element comment', () => {
  it('selects the element under the click', () => {
    const overlay = makeOverlay({ tool: 'element', elementFromPoint: () => para });
    pointer(overlay, 'pointerdown', 20, 20);
    expect(created[0]).toMatchObject({ kind: 'element', target: { selector: '#para' } });
  });

  it('does not create when no element is under the point', () => {
    const overlay = makeOverlay({ tool: 'element', elementFromPoint: () => null });
    pointer(overlay, 'pointerdown', 20, 20);
    expect(created).toHaveLength(0);
  });

  it('previews the hovered element', () => {
    const overlay = makeOverlay({ tool: 'element', elementFromPoint: () => para });
    pointer(overlay, 'pointermove', 20, 20);
    expect(container.querySelector(':scope svg rect[stroke-opacity="0.5"]')).not.toBeNull();
  });

  it('renders a committed element outline', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      { id: 'e', kind: 'element', createdAt: 0, target: targetFor('#para', 'p') },
    ]);
    expect(container.querySelector(':scope svg rect[stroke-dasharray]')).not.toBeNull();
  });
});

describe('Overlay — highlight', () => {
  it('captures a text selection on mouseup', () => {
    const range = document.createRange();
    range.selectNodeContents(para);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    makeOverlay({ tool: 'highlight' });
    document.dispatchEvent(new Event('mouseup'));

    expect(created[0]).toMatchObject({ kind: 'highlight', target: { selector: '#para' } });
  });

  it('does nothing on mouseup with no selection', () => {
    document.getSelection()?.removeAllRanges();
    makeOverlay({ tool: 'highlight' });
    document.dispatchEvent(new Event('mouseup'));
    expect(created).toHaveLength(0);
  });

  it('toggles pointer-events so page selection works', () => {
    const overlay = makeOverlay({ tool: 'highlight' });
    expect(overlay.element.style.pointerEvents).toBe('none');
    overlay.setTool('callout');
    expect(overlay.element.style.pointerEvents).toBe('auto');
  });
});

describe('Overlay — rendering', () => {
  it('renders committed callout/text/arrow annotations as SVG', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      {
        id: 'c',
        kind: 'callout',
        createdAt: 0,
        index: 2,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
        offset: { dx: 0, dy: 0 },
      },
      {
        id: 't',
        kind: 'text',
        createdAt: 0,
        note: 'note',
        target: targetFor('#para', 'p'),
        anchor: anchorOver('quick'),
        offset: { dx: 0, dy: 0 },
      },
      {
        id: 'a',
        kind: 'arrow',
        createdAt: 0,
        from: { dx: 0, dy: 0 },
        to: { dx: 4, dy: 4 },
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
      },
    ]);
    const svg = container.querySelector('svg');
    expect(svg?.querySelector('circle')).not.toBeNull();
    expect(svg?.querySelector('text')?.textContent).toBe('2');
    expect(svg?.querySelector('line')).not.toBeNull();
    // Text annotations render as a chip: a background rect plus the label.
    expect(svg?.querySelector('.stm-text__bg')).not.toBeNull();
    expect(svg?.querySelector('.stm-text__label')?.textContent).toBe('note');
  });

  it('renders highlight rects from the resolved range', () => {
    const spy = vi
      .spyOn(Range.prototype, 'getClientRects')
      .mockReturnValue([{ x: 0, y: 0, width: 10, height: 4 } as DOMRect] as unknown as DOMRectList);
    const overlay = makeOverlay();
    overlay.setAnnotations([
      {
        id: 'h',
        kind: 'highlight',
        createdAt: 0,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
      },
    ]);
    expect(container.querySelector(':scope svg rect')).not.toBeNull();
    spy.mockRestore();
  });

  it('re-renders on scroll/resize without throwing', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      {
        id: 'c',
        kind: 'callout',
        createdAt: 0,
        index: 1,
        target: targetFor('#para', 'p'),
        anchor: anchorOver('fox'),
        offset: { dx: 0, dy: 0 },
      },
    ]);
    dispatchEvent(new Event('scroll'));
    dispatchEvent(new Event('resize'));
    expect(container.querySelector(':scope svg g')).not.toBeNull();
  });

  it('uses real id/clock defaults when not injected', () => {
    const overlay = new Overlay({
      container,
      tool: 'callout',
      settings,
      onCreate: (a) => {
        created.push(a);
      },
      caretFromPoint: () => caretAt(4),
    });
    pointer(overlay, 'pointerdown', 1, 1);
    expect(typeof created[0]?.id).toBe('string');
    expect(typeof created[0]?.createdAt).toBe('number');
  });
});
