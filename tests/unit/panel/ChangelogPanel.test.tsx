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
      handoff={null}
      onSelectTool={vi.fn()}
      onEditNote={vi.fn()}
      onDelete={vi.fn()}
      onClearAll={vi.fn()}
      onExport={vi.fn()}
      onSendToAgent={vi.fn()}
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

  it('applies a panelActions override: relabels export and hides the other buttons', () => {
    renderPanel({
      annotations: [callout('a', 1)],
      actions: { exportLabel: 'Send to agent', showSendToAgent: false, showShareLink: false },
    });
    expect(screen.getByRole('button', { name: 'Send to agent' })).toHaveClass('stm-panel__export');
    expect(screen.queryByRole('button', { name: /copy to clipboard/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /copy share link/i })).toBeNull();
    // Exactly one footer action remains (the relabeled export).
    expect(document.querySelector('.stm-panel__send')).toBeNull();
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
      note: 'x',
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

  it('emits send-to-agent', async () => {
    const onSendToAgent = vi.fn();
    renderPanel({ annotations: [callout('a', 1)], onSendToAgent });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    expect(onSendToAgent).toHaveBeenCalledTimes(1);
  });

  it('disables copy share link with no annotations', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /copy share link/i })).toBeDisabled();
  });

  it('emits copy share link', async () => {
    const onCopyShareLink = vi.fn();
    renderPanel({ annotations: [callout('a', 1)], onCopyShareLink });
    await userEvent.click(screen.getByRole('button', { name: /copy share link/i }));
    expect(onCopyShareLink).toHaveBeenCalledTimes(1);
  });

  it('confirms a copied share link and reports a copy error', () => {
    renderPanel({ annotations: [callout('a', 1)], share: { kind: 'copied' } });
    expect(screen.getByText(/share link copied/i)).toBeInTheDocument();

    renderPanel({ annotations: [callout('a', 1)], share: { kind: 'error', message: 'nope' } });
    expect(screen.getByText('nope')).toBeInTheDocument();
  });

  it('summarizes placement and lists orphans after an import', () => {
    renderPanel({
      annotations: [callout('a', 1)],
      placement: { placed: 2, total: 3, orphans: [{ id: 'x', label: 'Fix footer' }] },
    });
    expect(screen.getByText(/of 3 shared marks/i)).toBeInTheDocument();
    expect(screen.getByText(/page changed since capture/i)).toBeInTheDocument();
    expect(screen.getByText('Fix footer')).toBeInTheDocument();
  });

  it('omits the orphan note when every mark placed', () => {
    renderPanel({
      annotations: [callout('a', 1)],
      placement: { placed: 1, total: 1, orphans: [] },
    });
    expect(screen.getByText(/of 1 shared marks/i)).toBeInTheDocument();
    expect(screen.queryByText(/page changed since capture/i)).not.toBeInTheDocument();
  });

  it('shows the handoff command after sending', () => {
    renderPanel({
      annotations: [callout('a', 1)],
      handoff: { kind: 'sent', command: 'share-the-mark show ab12' },
    });
    expect(screen.getByText('share-the-mark show ab12')).toBeInTheDocument();
  });

  it('shows a handoff error when the daemon is unreachable', () => {
    renderPanel({
      annotations: [callout('a', 1)],
      handoff: { kind: 'error', message: 'daemon not reachable — run `share-the-mark serve`' },
    });
    expect(screen.getByText(/daemon not reachable/i)).toBeInTheDocument();
  });

  it('renders an open-options action and routes it to onOpenOptions', async () => {
    const onOpenOptions = vi.fn();
    renderPanel({
      annotations: [callout('a', 1)],
      handoff: {
        kind: 'error',
        message: 'no daemon yet',
        action: { label: 'Open setup', kind: 'open-options' },
      },
      onOpenOptions,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Open setup' }));
    expect(onOpenOptions).toHaveBeenCalledTimes(1);
  });

  it('renders an href action as an external link to the hub', () => {
    renderPanel({
      annotations: [callout('a', 1)],
      handoff: {
        kind: 'error',
        message: 'out of date',
        action: { label: 'How to update', href: 'https://github.com/mpecan/share-the-mark' },
      },
    });
    const link = screen.getByRole('link', { name: 'How to update' });
    expect(link).toHaveAttribute('href', 'https://github.com/mpecan/share-the-mark');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('collapses and expands via the toggle', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /collapse panel/i }));
    expect(screen.getByRole('button', { name: /expand panel/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await userEvent.click(screen.getByRole('button', { name: /expand panel/i }));
    expect(screen.getByRole('button', { name: /collapse panel/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('clears all only after confirmation', async () => {
    const onClearAll = vi.fn();
    renderPanel({ annotations: [callout('a', 1)], onClearAll });

    // Cancel path: "Clear all" → "Keep" does not clear.
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep/i }));
    expect(onClearAll).not.toHaveBeenCalled();

    // Confirm path: "Clear all" → "Clear" clears.
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
