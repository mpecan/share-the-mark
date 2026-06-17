import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Overlay, type OverlayOptions } from '@/src/overlay';
import type { DrawContext, RenderOptions } from '@/src/capture';
import type { Annotation } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

const settings: RenderOptions = {
  strokeColor: '#e11d48',
  strokeWidth: 3,
  highlightColor: '#fde047',
  scale: 1,
};

const sampleTarget: TargetRef = {
  selector: '#hero',
  fallbacks: [],
  tag: 'div',
  rect: { x: 0, y: 0, width: 0, height: 0 },
};

let container: HTMLElement;
let created: Annotation[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
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
    createId: () => `id-${String(++counter)}`,
    now: () => 1000,
    resolveTarget: () => sampleTarget,
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
  it('mounts a canvas and svg layer into the container', () => {
    makeOverlay();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('removes itself on destroy', () => {
    const overlay = makeOverlay();
    overlay.destroy();
    expect(container.querySelector('canvas')).toBeNull();
  });
});

describe('Overlay — click tools', () => {
  it('creates an anchored callout on a single click', () => {
    const overlay = makeOverlay({ tool: 'callout' });
    pointer(overlay, 'pointerdown', 30, 40);

    expect(created).toHaveLength(1);
    const annotation = created[0];
    expect(annotation).toMatchObject({
      kind: 'callout',
      anchor: { x: 30, y: 40 },
      id: 'id-1',
      createdAt: 1000,
      target: sampleTarget,
    });
    expect(overlay.getState()).toBe('idle');
  });

  it('creates a text annotation from the prompt', () => {
    const overlay = makeOverlay({ tool: 'text', promptText: () => 'hello world' });
    pointer(overlay, 'pointerdown', 5, 5);
    expect(created[0]).toMatchObject({
      kind: 'text',
      content: 'hello world',
      position: { x: 5, y: 5 },
    });
  });

  it('skips text creation when the prompt is cancelled', () => {
    const overlay = makeOverlay({ tool: 'text', promptText: () => null });
    pointer(overlay, 'pointerdown', 5, 5);
    expect(created).toHaveLength(0);
  });
});

describe('Overlay — drag tools', () => {
  it('creates a normalized rectangle and transitions through drawing', () => {
    const overlay = makeOverlay({ tool: 'rectangle' });
    pointer(overlay, 'pointerdown', 50, 40);
    expect(overlay.getState()).toBe('drawing');
    pointer(overlay, 'pointermove', 10, 10);
    pointer(overlay, 'pointerup', 10, 10);

    expect(overlay.getState()).toBe('idle');
    expect(created[0]).toMatchObject({
      kind: 'rectangle',
      rect: { x: 10, y: 10, width: 40, height: 30 },
      target: sampleTarget,
    });
  });

  it('accumulates a pencil path and does not anchor it', () => {
    const overlay = makeOverlay({ tool: 'pencil' });
    pointer(overlay, 'pointerdown', 0, 0);
    pointer(overlay, 'pointermove', 1, 1);
    pointer(overlay, 'pointermove', 2, 2);
    pointer(overlay, 'pointerup', 2, 2);

    const annotation = created[0];
    expect(annotation?.kind).toBe('pencil');
    if (annotation?.kind === 'pencil') {
      expect(annotation.path.length).toBeGreaterThanOrEqual(3);
    }
    expect(annotation?.target).toBeUndefined();
  });

  it('ignores stray move/up events when idle', () => {
    const overlay = makeOverlay({ tool: 'rectangle' });
    pointer(overlay, 'pointermove', 5, 5);
    pointer(overlay, 'pointerup', 5, 5);
    expect(created).toHaveLength(0);
  });
});

describe('Overlay — rendering', () => {
  it('renders committed vector annotations as SVG', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      { id: '1', kind: 'callout', createdAt: 0, index: 2, anchor: { x: 10, y: 20 } },
      { id: '2', kind: 'arrow', createdAt: 0, from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
    ]);
    const svg = container.querySelector('svg');
    expect(svg?.querySelector('circle')).not.toBeNull();
    expect(svg?.querySelector('text')?.textContent).toBe('2');
    expect(svg?.querySelector('line')).not.toBeNull();
  });

  it('renders rectangle, ellipse, and text annotations as SVG', () => {
    const overlay = makeOverlay();
    overlay.setAnnotations([
      { id: '1', kind: 'rectangle', createdAt: 0, rect: { x: 0, y: 0, width: 4, height: 4 } },
      { id: '2', kind: 'ellipse', createdAt: 0, rect: { x: 0, y: 0, width: 8, height: 6 } },
      { id: '3', kind: 'text', createdAt: 0, position: { x: 2, y: 3 }, content: 'note' },
    ]);
    const svg = container.querySelector('svg');
    expect(svg?.querySelector('rect')).not.toBeNull();
    expect(svg?.querySelector('ellipse')).not.toBeNull();
    expect(svg?.querySelector('text')?.textContent).toBe('note');
  });

  it('switches the active tool', () => {
    const overlay = makeOverlay({ tool: 'callout' });
    overlay.setTool('rectangle');
    pointer(overlay, 'pointerdown', 0, 0);
    expect(overlay.getState()).toBe('drawing');
    pointer(overlay, 'pointerup', 10, 10);
    expect(created[0]?.kind).toBe('rectangle');
  });

  it('draws raster annotations onto the canvas when a context is available', () => {
    const ops: string[] = [];
    const recordingContext = new Proxy({} as DrawContext, {
      get: (_t, prop) =>
        typeof prop === 'string'
          ? (): void => {
              ops.push(prop);
            }
          : undefined,
      set: () => true,
    });
    const overlay = makeOverlay({ tool: 'pencil', getContext: () => recordingContext });
    overlay.setAnnotations([
      {
        id: '1',
        kind: 'pencil',
        createdAt: 0,
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ]);
    expect(ops).toContain('clearRect');
    expect(ops).toContain('stroke');
  });

  it('re-renders the canvas on viewport resize', () => {
    const ops: string[] = [];
    const recordingContext = new Proxy({} as DrawContext, {
      get: (_t, prop) =>
        typeof prop === 'string'
          ? (): void => {
              ops.push(prop);
            }
          : undefined,
      set: () => true,
    });
    makeOverlay({ getContext: () => recordingContext });
    const before = ops.length;
    dispatchEvent(new Event('resize'));
    expect(ops.length).toBeGreaterThan(before);
  });

  it('uses real id/clock defaults when not injected', () => {
    const overlay = new Overlay({
      container,
      tool: 'callout',
      settings,
      onCreate: (a) => {
        created.push(a);
      },
    });
    pointer(overlay, 'pointerdown', 1, 1);
    expect(typeof created[0]?.id).toBe('string');
    expect(typeof created[0]?.createdAt).toBe('number');
  });

  it('ignores a second pointerdown while already drawing', () => {
    const overlay = makeOverlay({ tool: 'rectangle' });
    pointer(overlay, 'pointerdown', 0, 0);
    pointer(overlay, 'pointerdown', 5, 5); // ignored — state is 'drawing'
    pointer(overlay, 'pointerup', 10, 10);
    expect(created).toHaveLength(1);
  });

  it('falls back to the global prompt for text when none is injected', () => {
    vi.stubGlobal('prompt', () => 'from prompt');
    const overlay = new Overlay({
      container,
      tool: 'text',
      settings,
      onCreate: (a) => {
        created.push(a);
      },
    });
    pointer(overlay, 'pointerdown', 1, 1);
    expect(created[0]).toMatchObject({ kind: 'text', content: 'from prompt' });
    vi.unstubAllGlobals();
  });
});
