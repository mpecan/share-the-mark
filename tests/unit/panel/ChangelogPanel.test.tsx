import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangelogPanel } from '@/src/panel';
import type { Annotation } from '@/src/core/model';

function callout(id: string, index: number, note?: string): Annotation {
  const annotation: Annotation = {
    id,
    kind: 'callout',
    createdAt: 0,
    index,
    anchor: { x: 0, y: 0 },
  };
  if (note !== undefined) annotation.note = note;
  return annotation;
}

describe('ChangelogPanel', () => {
  it('shows an empty state and disables export with no annotations', () => {
    render(
      <ChangelogPanel
        annotations={[]}
        onEditNote={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText(/no annotations yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeDisabled();
  });

  it('lists annotations with callout numbers and a bullet for other kinds', () => {
    const pencil: Annotation = { id: 'p', kind: 'pencil', createdAt: 0, path: [] };
    render(
      <ChangelogPanel
        annotations={[callout('a', 1, 'Fix heading'), pencil]}
        onEditNote={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('•')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Fix heading')).toBeInTheDocument();
  });

  it('emits note edits', async () => {
    const onEditNote = vi.fn();
    render(
      <ChangelogPanel
        annotations={[callout('a', 1)]}
        onEditNote={onEditNote}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText(/note for callout/i), 'x');
    expect(onEditNote).toHaveBeenCalledWith('a', 'x');
  });

  it('emits delete and export', async () => {
    const onDelete = vi.fn();
    const onExport = vi.fn();
    render(
      <ChangelogPanel
        annotations={[callout('a', 1)]}
        onEditNote={vi.fn()}
        onDelete={onDelete}
        onExport={onExport}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /delete callout/i }));
    await userEvent.click(screen.getByRole('button', { name: /copy to clipboard/i }));
    expect(onDelete).toHaveBeenCalledWith('a');
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
