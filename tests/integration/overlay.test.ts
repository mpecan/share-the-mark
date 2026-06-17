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

beforeEach(() => {
  container = document.createElement('div');
  container.innerHTML = '<p id="para">The quick brown fox</p>';
  document.body.append(container);
  const p = container.querySelector('#para');
  if (!p?.firstChild) throw new Error('fixture missing');
  para = p;
  textNode = p.firstChild as Text;
  created = [];
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
    createId: () => `id-${String(++counter)}`,
    now: () => 1000,
    promptText: () => 'typed text',
    caretFromPoint: () => caretAt(4), // the 'q' in "The quick"
    ...overrides,
  });
}

function pointer(overlay: Overlay, type: string, x: number, y: number): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
  overlay.element.dispatchEvent(event);
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
  it('anchors the head and stores the tail offset', () => {
    const overlay = makeOverlay({ tool: 'arrow' });
    pointer(overlay, 'pointerdown', 10, 10);
    expect(overlay.getState()).toBe('drawing');
    pointer(overlay, 'pointermove', 40, 30);
    pointer(overlay, 'pointerup', 40, 30);
    expect(overlay.getState()).toBe('idle');
    expect(created[0]).toMatchObject({
      kind: 'arrow',
      tail: { dx: 10, dy: 10 },
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
      },
      {
        id: 't',
        kind: 'text',
        createdAt: 0,
        content: 'note',
        target: targetFor('#para', 'p'),
        anchor: anchorOver('quick'),
      },
      {
        id: 'a',
        kind: 'arrow',
        createdAt: 0,
        tail: { dx: 4, dy: 4 },
        target: targetFor('#para', 'p'),
        anchor: anchorOver('brown'),
      },
    ]);
    const svg = container.querySelector('svg');
    expect(svg?.querySelector('circle')).not.toBeNull();
    expect(svg?.querySelector('text')?.textContent).toBe('2');
    expect(svg?.querySelector('line')).not.toBeNull();
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
