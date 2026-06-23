import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangelogPanel, type ChangelogPanelProps } from '@/src/panel';
import type { Annotation } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';
import { HUB_URL } from '@/src/core/links';

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
      onShowAgentSetup={vi.fn()}
      onCloseAgentSetup={vi.fn()}
      onSubmitToAgent={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ChangelogPanel', () => {
  it('shows an empty state and disables export with no annotations', () => {
    renderPanel();
    expect(screen.getByText(/no marks yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeDisabled();
  });

  it('applies an explicit theme as data-theme and omits it for auto', () => {
    const { unmount } = render(
      <ChangelogPanel
        annotations={[]}
        activeTool="callout"
        handoff={null}
        theme="light"
        onSelectTool={vi.fn()}
        onEditNote={vi.fn()}
        onDelete={vi.fn()}
        onClearAll={vi.fn()}
        onExport={vi.fn()}
        onShowAgentSetup={vi.fn()}
        onCloseAgentSetup={vi.fn()}
        onSubmitToAgent={vi.fn()}
      />,
    );
    expect(document.querySelector('.stm-panel')).toHaveAttribute('data-theme', 'light');
    unmount();
    renderPanel({ theme: 'auto' });
    expect(document.querySelector('.stm-panel')).not.toHaveAttribute('data-theme');
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

  it('opens the agent-setup view and starts polling', async () => {
    const onShowAgentSetup = vi.fn();
    renderPanel({ annotations: [callout('a', 1)], onShowAgentSetup });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    expect(onShowAgentSetup).toHaveBeenCalledTimes(1);
    // The view switches: a Back control + a connection status appear.
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('leaves the agent-setup view via Back and stops polling', async () => {
    const onCloseAgentSetup = vi.fn();
    renderPanel({
      annotations: [callout('a', 1)],
      connection: { status: 'disconnected' },
      onCloseAgentSetup,
    });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCloseAgentSetup).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('toolbar', { name: /annotation tools/i })).toBeInTheDocument();
  });

  it('shows the connect command and disables send while disconnected', async () => {
    renderPanel({ annotations: [callout('a', 1)], connection: { status: 'disconnected' } });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    expect(screen.getByText('share-the-mark start')).toBeInTheDocument();
    expect(screen.getByText(/waiting for the cli to connect/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send 1 mark/i })).toBeDisabled();
  });

  it('routes the disconnected "set it up" CTA to onOpenOptions', async () => {
    const onOpenOptions = vi.fn();
    renderPanel({
      annotations: [callout('a', 1)],
      connection: { status: 'disconnected' },
      onOpenOptions,
    });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Set it up' }));
    expect(onOpenOptions).toHaveBeenCalledTimes(1);
  });

  it('omits the "set it up" CTA when no onOpenOptions is wired', async () => {
    renderPanel({ annotations: [callout('a', 1)], connection: { status: 'disconnected' } });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    expect(screen.queryByRole('button', { name: 'Set it up' })).toBeNull();
  });

  it('copies the connect command to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPanel({ annotations: [callout('a', 1)], connection: { status: 'disconnected' } });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('share-the-mark start');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('routes the not-permitted CTA to onOpenOptions', async () => {
    const onOpenOptions = vi.fn();
    renderPanel({
      annotations: [callout('a', 1)],
      connection: { status: 'not-permitted' },
      onOpenOptions,
    });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Open setup' }));
    expect(onOpenOptions).toHaveBeenCalledTimes(1);
  });

  it('links to the hub when the daemon is incompatible', async () => {
    renderPanel({
      annotations: [callout('a', 1)],
      connection: { status: 'incompatible', reason: 'daemon-too-old', need: '0.2.0' },
    });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    expect(screen.getByText(/out of date \(need ≥ 0\.2\.0\)/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How to update' })).toHaveAttribute('href', HUB_URL);
  });

  it('enables send when connected and emits onSubmitToAgent', async () => {
    const onSubmitToAgent = vi.fn();
    renderPanel({
      annotations: [callout('a', 1)],
      connection: { status: 'connected', version: '1.2.3', address: '127.0.0.1:8787' },
      onSubmitToAgent,
    });
    await userEvent.click(screen.getByRole('button', { name: /send to agent/i }));
    expect(screen.getByText(/connected to the local daemon/i)).toBeInTheDocument();
    expect(screen.getByText(/share-the-mark v1\.2\.3 ·/)).toBeInTheDocument();
    const send = screen.getByRole('button', { name: /send 1 mark/i });
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(onSubmitToAgent).toHaveBeenCalledTimes(1);
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
      handoff: { kind: 'error', message: 'daemon not reachable — run `share-the-mark start`' },
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
