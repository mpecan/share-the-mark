import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Overlay, type OverlayOptions } from '@/src/overlay';
import { describeRange } from '@/src/anchor';
import type { Annotation, TextAnchor } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

const settings = { strokeColor: '#e11d48', strokeWidth: 3, highlightColor: '#fde047' };

function targetFor(selector: string, tag: string): TargetRef {
  return { selector, fallbacks: [], tag, rect: { x: 0, y: 0, width: 0, height: 0 } };
}

let container: HTMLElement;
let para: Element;
let textNode: Text;
let created: Annotation[];
let updated: Annotation[];

beforeEach(() => {
  container = document.createElement('div');
  container.innerHTML = '<p id="para">The quick brown fox</p>';
  document.body.append(container);
  const p = container.querySelector('#para');
  if (!p?.firstChild) throw new Error('fixture missing');
  para = p;
  textNode = p.firstChild as Text;
  created = [];
  updated = [];
});

afterEach(() => {
  container.remove();
});

function caretAt(offset: number): Range {
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  return range;
}

function anchorOver(substring: string): TextAnchor {
  const index = textNode.data.indexOf(substring);
  const range = document.createRange();
  range.setStart(textNode, index);
  range.setEnd(textNode, index + substring.length);
  return describeRange(para, range);
}

function makeOverlay(overrides: Partial<OverlayOptions> = {}): Overlay {
  let counter = 0;
  return new Overlay({
    container,
    tool: 'callout',
    settings,
    onCreate: (a) => {
      created.push(a);
    },
    onUpdate: (a) => {
      updated.push(a);
    },
    createId: () => `id-${String(++counter)}`,
    now: () => 1000,
    promptText: () => 'typed text',
    caretFromPoint: () => caretAt(4), // the 'q' in "The quick"
    ...overrides,
  });
}

function makeEvent(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
  return event;
}

function pointer(overlay: Overlay, type: string, x: number, y: number): void {
  overlay.element.dispatchEvent(makeEvent(type, x, y));
}

function pointerOn(el: Element, type: string, x: number, y: number): void {
  el.dispatchEvent(makeEvent(type, x, y));
}

function findMark(id: string): Element {
  const mark = container.querySelector(`[data-stm-id="${CSS.escape(id)}"]`);
  if (!mark) throw new Error('mark not found');
  return mark;
}

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
    expect(created[0]).toMatchObject({ kind: 'text', content: 'hello', anchor: { exact: 'q' } });
  });

  it('skips text creation when the prompt is cancelled', () => {
    const overlay = makeOverlay({ tool: 'text', promptText: () => null });
    pointer(overlay, 'pointerdown', 5, 5);
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

describe('Overlay — editing', () => {
  it('moves a callout by dragging it (updates the offset)', () => {
    const overlay = makeOverlay();
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

  it('drags an arrow endpoint handle', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      {
        id: 'a',
        kind: 'arrow',
        createdAt: 0,
        from: { dx: 0, dy: 0 },
        to: { dx: 10, dy: 10 },
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
      },
    ]);
    const handle = container.querySelector(':scope [data-stm-handle="to"]');
    if (!handle) throw new Error('handle not found');
    pointerOn(handle, 'pointerdown', 30, 30);
    pointer(overlay, 'pointermove', 35, 38);
    pointer(overlay, 'pointerup', 35, 38);
    expect(updated[0]).toMatchObject({
      kind: 'arrow',
      from: { dx: 0, dy: 0 },
      to: { dx: 15, dy: 18 },
    });
  });

  it('moves a whole arrow by dragging its line', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      {
        id: 'a',
        kind: 'arrow',
        createdAt: 0,
        from: { dx: 0, dy: 0 },
        to: { dx: 10, dy: 10 },
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
      },
    ]);
    const line = container.querySelector(':scope [data-stm-id="a"] line');
    if (!line) throw new Error('line not found');
    pointerOn(line, 'pointerdown', 20, 20);
    pointer(overlay, 'pointermove', 25, 27);
    pointer(overlay, 'pointerup', 25, 27);
    expect(updated[0]).toMatchObject({
      kind: 'arrow',
      from: { dx: 5, dy: 7 },
      to: { dx: 15, dy: 17 },
    });
  });

  it('extends a highlight by dragging its end handle', () => {
    const spy = vi
      .spyOn(Range.prototype, 'getClientRects')
      .mockReturnValue([{ x: 0, y: 0, width: 10, height: 4 } as DOMRect] as unknown as DOMRectList);
    const overlay = makeOverlay({ caretFromPoint: () => caretAt(19) }); // end of the text
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
    const overlay = makeOverlay({ caretFromPoint: () => caretAt(0) }); // start of the text
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
    const overlay = makeOverlay({ caretFromPoint: () => null });
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
    const overlay = makeOverlay({ caretFromPoint: () => caretAt(2) });
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
    const overlay = makeOverlay();
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
    const overlay = makeOverlay({ promptText: () => 'new content' });
    overlay.setAnnotations([
      {
        id: 't',
        kind: 'text',
        createdAt: 0,
        content: 'old',
        target: targetFor('#para', 'p'),
        anchor: anchorOver('quick'),
        offset: { dx: 0, dy: 0 },
      },
    ]);
    pointerOn(findMark('t'), 'dblclick', 0, 0);
    expect(updated[0]).toMatchObject({ id: 't', kind: 'text', content: 'new content' });
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
        content: 'note',
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
