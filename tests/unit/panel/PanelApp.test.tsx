import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { PanelApp, PanelErrorBoundary, type PanelSnapshot, type PanelStore } from '@/src/panel';
import type { Annotation } from '@/src/core/model';

function makeStore(initial: PanelSnapshot): PanelStore & { set: (next: PanelSnapshot) => void } {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    set: (next) => {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}

const handlers = {
  onSelectTool: vi.fn(),
  onEditNote: vi.fn(),
  onDelete: vi.fn(),
  onExport: vi.fn(),
};

function Boom(): never {
  throw new Error('boom');
}

describe('PanelApp', () => {
  it('renders from the store and re-renders when it changes', () => {
    const store = makeStore({ annotations: [], activeTool: 'callout' });
    render(<PanelApp store={store} {...handlers} />);
    expect(screen.getByText(/no annotations yet/i)).toBeInTheDocument();

    const callout: Annotation = {
      id: 'a',
      kind: 'callout',
      createdAt: 0,
      index: 1,
      anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' },
      target: {
        selector: '#x',
        fallbacks: [],
        tag: 'div',
        rect: { x: 0, y: 0, width: 0, height: 0 },
      },
    };
    act(() => {
      store.set({ annotations: [callout], activeTool: 'arrow' });
    });

    expect(screen.queryByText(/no annotations yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'arrow' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('PanelErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a fallback when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    render(
      <PanelErrorBoundary>
        <Boom />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('renders children when they do not throw', () => {
    render(
      <PanelErrorBoundary>
        <p>healthy</p>
      </PanelErrorBoundary>,
    );
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });
});
