import { Component, useSyncExternalStore, type ErrorInfo, type JSX, type ReactNode } from 'react';
import { ChangelogPanel } from './ChangelogPanel';
import type { Annotation, ToolKind } from '@/src/core/model';

// React wrapper for the changelog panel (SPEC §5.8). The content script owns the
// state and exposes it as an external store; the panel subscribes via
// useSyncExternalStore so React drives re-renders itself — no re-entrant
// root.render() from inside event handlers (which intermittently crashed the
// panel). An error boundary keeps a render fault from tearing down the UI.

/** Result of a "Send to agent" attempt, surfaced as a handoff line in the panel. */
export type Handoff = { kind: 'sent'; command: string } | { kind: 'error'; message: string };

export interface PanelSnapshot {
  annotations: readonly Annotation[];
  activeTool: ToolKind;
  handoff: Handoff | null;
}

export interface PanelStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PanelSnapshot;
}

export interface PanelHandlers {
  onSelectTool: (tool: ToolKind) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onExport: () => void;
  onSendToAgent: () => void;
}

export interface PanelAppProps extends PanelHandlers {
  store: PanelStore;
}

export class PanelErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[share-the-mark] panel render error', error, info);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section className="stm-panel" aria-label="Changelog">
          <p className="stm-panel__empty">Something went wrong. Toggle annotation mode to reset.</p>
        </section>
      );
    }
    return this.props.children;
  }
}

export function PanelApp({
  store,
  onSelectTool,
  onEditNote,
  onDelete,
  onClearAll,
  onExport,
  onSendToAgent,
}: PanelAppProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <PanelErrorBoundary>
      <ChangelogPanel
        annotations={snapshot.annotations}
        activeTool={snapshot.activeTool}
        handoff={snapshot.handoff}
        onSelectTool={onSelectTool}
        onEditNote={onEditNote}
        onDelete={onDelete}
        onClearAll={onClearAll}
        onExport={onExport}
        onSendToAgent={onSendToAgent}
      />
    </PanelErrorBoundary>
  );
}
