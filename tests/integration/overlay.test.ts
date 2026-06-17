import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Overlay, type OverlayOptions } from '@/src/overlay';
import type { Annotation } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

const settings = { strokeColor: '#e11d48', strokeWidth: 3, highlightColor: '#fde047' };

function targetFor(selector: string, tag: string): TargetRef {
  return { selector, fallbacks: [], tag, rect: { x: 0, y: 0, width: 0, height: 0 } };
}

const anchorTarget: TargetRef = {
  selector: '#anchor',
  fallbacks: [],
  tag: 'div',
  rect: { x: 0, y: 0, width: 0, height: 0 },
};

let container: HTMLElement;
let anchorEl: HTMLElement;
let created: Annotation[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  anchorEl = document.createElement('div');
  anchorEl.id = 'anchor';
  container.append(anchorEl);
  created = [];
});

afterEach(() => {
  container.remove();
});

function makeOverlay(overrides: Partial<OverlayOptions> = {}): Overlay {
  let counter = 0;
  return new Overlay({
    container,
    tool: 'callout',
    settings,
    onCreate: (a) => {
      created.push(a);
    },
    resolveTarget: () => ({ target: anchorTarget, element: anchorEl }),
    createId: () => `id-${String(++counter)}`,
    now: () => 1000,
    promptText: () => 'typed text',
    ...overrides,
  });
}

function pointer(overlay: Overlay, type: string, x: number, y: number): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
  overlay.element.dispatchEvent(event);
}

describe('Overlay — mounting', () => {
  it('mounts an svg layer into the container', () => {
    makeOverlay();
    expect(container.querySelector(':scope [data-stm-overlay] svg')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('removes itself on destroy', () => {
    const overlay = makeOverlay();
    overlay.destroy();
    expect(container.querySelector('[data-stm-overlay]')).toBeNull();
  });
});

describe('Overlay — click tools', () => {
  it('creates an anchored callout offset from the element box', () => {
    const overlay = makeOverlay({ tool: 'callout' });
    pointer(overlay, 'pointerdown', 30, 40);

    expect(created[0]).toMatchObject({
      kind: 'callout',
      target: anchorTarget,
      at: { dx: 30, dy: 40 },
      id: 'id-1',
      createdAt: 1000,
    });
    expect(overlay.getState()).toBe('idle');
  });

  it('creates an anchored text annotation from the prompt', () => {
    const overlay = makeOverlay({ tool: 'text', promptText: () => 'hello' });
    pointer(overlay, 'pointerdown', 5, 6);
    expect(created[0]).toMatchObject({ kind: 'text', content: 'hello', at: { dx: 5, dy: 6 } });
  });

  it('skips text creation when the prompt is cancelled', () => {
    const overlay = makeOverlay({ tool: 'text', promptText: () => null });
    pointer(overlay, 'pointerdown', 5, 5);
    expect(created).toHaveLength(0);
  });
});

describe('Overlay — arrow', () => {
  it('creates an anchored arrow from a drag', () => {
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
      target: anchorTarget,
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
    anchorEl.innerHTML = '<p id="para">hello world</p>';
    const para = anchorEl.querySelector('#para');
    if (!para) throw new Error('fixture missing');
    const range = document.createRange();
    range.selectNodeContents(para);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    makeOverlay({ tool: 'highlight' });
    document.dispatchEvent(new Event('mouseup'));

    expect(created[0]?.kind).toBe('highlight');
    if (created[0]?.kind === 'highlight') {
      expect(created[0].quote).toContain('hello');
    }
  });

  it('does nothing on mouseup with no selection', () => {
    document.getSelection()?.removeAllRanges();
    makeOverlay({ tool: 'highlight' });
    document.dispatchEvent(new Event('mouseup'));
    expect(created).toHaveLength(0);
  });

  it('sets pointer-events to none so page selection works', () => {
    const overlay = makeOverlay({ tool: 'highlight' });
    expect(overlay.element.style.pointerEvents).toBe('none');
    overlay.setTool('callout');
    expect(overlay.element.style.pointerEvents).toBe('auto');
  });
});

describe('Overlay — rendering', () => {
  it('renders committed annotations as SVG, resolved from the DOM', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      {
        id: '1',
        kind: 'callout',
        createdAt: 0,
        index: 2,
        at: { dx: 4, dy: 5 },
        target: anchorTarget,
      },
    ]);
    const svg = container.querySelector('svg');
    expect(svg?.querySelector('circle')).not.toBeNull();
    expect(svg?.querySelector('text')?.textContent).toBe('2');
  });

  it('renders text and arrow annotations as SVG', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      {
        id: 't',
        kind: 'text',
        createdAt: 0,
        content: 'note',
        at: { dx: 1, dy: 2 },
        target: anchorTarget,
      },
      {
        id: 'a',
        kind: 'arrow',
        createdAt: 0,
        from: { dx: 0, dy: 0 },
        to: { dx: 5, dy: 5 },
        target: anchorTarget,
      },
    ]);
    const svg = container.querySelector('svg');
    expect(svg?.querySelector('text')?.textContent).toBe('note');
    expect(svg?.querySelector('line')).not.toBeNull();
  });

  it('renders highlight rects from the resolved range', () => {
    anchorEl.innerHTML = '<p id="para">hello world</p>';
    const spy = vi
      .spyOn(Range.prototype, 'getClientRects')
      .mockReturnValue([{ x: 0, y: 0, width: 10, height: 4 } as DOMRect] as unknown as DOMRectList);
    const overlay = makeOverlay();
    overlay.setAnnotations([
      {
        id: 'h',
        kind: 'highlight',
        createdAt: 0,
        startOffset: 0,
        endOffset: 5,
        quote: 'hello',
        target: targetFor('#para', 'p'),
      },
    ]);
    expect(container.querySelector(':scope svg rect')).not.toBeNull();
    spy.mockRestore();
  });

  it('re-renders on scroll and resize without throwing', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      {
        id: '1',
        kind: 'callout',
        createdAt: 0,
        index: 1,
        at: { dx: 0, dy: 0 },
        target: anchorTarget,
      },
    ]);
    dispatchEvent(new Event('scroll'));
    dispatchEvent(new Event('resize'));
    expect(container.querySelector(':scope svg circle')).not.toBeNull();
  });

  it('uses real id/clock defaults when not injected', () => {
    const overlay = new Overlay({
      container,
      tool: 'callout',
      settings,
      onCreate: (a) => {
        created.push(a);
      },
      resolveTarget: () => ({ target: anchorTarget, element: anchorEl }),
    });
    pointer(overlay, 'pointerdown', 1, 1);
    expect(typeof created[0]?.id).toBe('string');
    expect(typeof created[0]?.createdAt).toBe('number');
  });

  it('does not create when the target cannot be resolved', () => {
    const overlay = makeOverlay({ tool: 'callout', resolveTarget: vi.fn() });
    pointer(overlay, 'pointerdown', 1, 1);
    expect(created).toHaveLength(0);
  });
});
