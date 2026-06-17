import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangelogPanel, type ChangelogPanelProps } from '@/src/panel';
import type { Annotation } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

const target: TargetRef = {
  selector: '#x',
  fallbacks: [],
  tag: 'div',
  rect: { x: 0, y: 0, width: 0, height: 0 },
};

function callout(id: string, index: number, note?: string): Annotation {
  const annotation: Annotation = {
    id,
    kind: 'callout',
    createdAt: 0,
    index,
    anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' },
    offset: { dx: 0, dy: 0 },
    target,
  };
  if (note !== undefined) annotation.note = note;
  return annotation;
}

function renderPanel(overrides: Partial<ChangelogPanelProps> = {}): void {
  render(
    <ChangelogPanel
      annotations={[]}
      activeTool="callout"
      onSelectTool={vi.fn()}
      onEditNote={vi.fn()}
      onDelete={vi.fn()}
      onExport={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ChangelogPanel', () => {
  it('shows an empty state and disables export with no annotations', () => {
    renderPanel();
    expect(screen.getByText(/no annotations yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeDisabled();
  });

  it('renders a tool palette with the active tool pressed', () => {
    renderPanel({ activeTool: 'arrow' });
    expect(screen.getByRole('button', { name: 'arrow' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'callout' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('emits the selected tool', async () => {
    const onSelectTool = vi.fn();
    renderPanel({ onSelectTool });
    await userEvent.click(screen.getByRole('button', { name: 'highlight' }));
    expect(onSelectTool).toHaveBeenCalledWith('highlight');
  });

  it('lists annotations with callout numbers and a bullet for other kinds', () => {
    const note: Annotation = {
      id: 'n',
      kind: 'text',
      createdAt: 0,
      content: 'x',
      anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' },
      offset: { dx: 0, dy: 0 },
      target,
    };
    renderPanel({ annotations: [callout('a', 1, 'Fix heading'), note] });
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('•')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Fix heading')).toBeInTheDocument();
  });

  it('emits note edits', async () => {
    const onEditNote = vi.fn();
    renderPanel({ annotations: [callout('a', 1)], onEditNote });
    await userEvent.type(screen.getByLabelText(/note for callout/i), 'x');
    expect(onEditNote).toHaveBeenCalledWith('a', 'x');
  });

  it('emits delete and export', async () => {
    const onDelete = vi.fn();
    const onExport = vi.fn();
    renderPanel({ annotations: [callout('a', 1)], onDelete, onExport });
    await userEvent.click(screen.getByRole('button', { name: /delete callout/i }));
    await userEvent.click(screen.getByRole('button', { name: /copy to clipboard/i }));
    expect(onDelete).toHaveBeenCalledWith('a');
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
