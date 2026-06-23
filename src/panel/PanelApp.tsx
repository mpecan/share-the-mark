import { Component, useSyncExternalStore, type ErrorInfo, type JSX, type ReactNode } from 'react';
import { ChangelogPanel } from './ChangelogPanel';
import type { Annotation, ToolKind } from '@/src/core/model';
import type { AgentConnection } from '@/src/core/agent';
import type { ThemeMode } from '@/src/storage/settings-defaults';
import type { PlacementSummary } from '@/src/share';

// React wrapper for the changelog panel (SPEC §5.8). The content script owns the
// state and exposes it as an external store; the panel subscribes via
// useSyncExternalStore so React drives re-renders itself — no re-entrant
// root.render() from inside event handlers (which intermittently crashed the
// panel). An error boundary keeps a render fault from tearing down the UI.

/** An optional call-to-action on an error handoff (SPEC §11.2): either opens the
 * extension Options page (where the CLI install lives) or links out to the hub. */
export type HandoffAction =
  | { label: string; kind: 'open-options' }
  | { label: string; href: string };

/** Result of a "Send to agent" attempt, surfaced as a handoff line in the panel. */
export type Handoff =
  | { kind: 'sent'; command: string }
  | { kind: 'error'; message: string; action?: HandoffAction };

/** Result of a "Copy share link" attempt (SPEC §12). */
export type ShareNotice = { kind: 'copied' } | { kind: 'error'; message: string };

export interface PanelSnapshot {
  annotations: readonly Annotation[];
  activeTool: ToolKind;
  handoff: Handoff | null;
  /** Feedback after copying a cross-machine share link. */
  share?: ShareNotice | null;
  /** Summary shown after importing a shared brief: placed vs orphaned marks. */
  placement?: PlacementSummary | null;
  /** Live daemon-connection status, polled while the agent-setup view is open. */
  connection?: AgentConnection | null;
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
  /** Open the agent-setup view and start polling the local daemon. */
  onShowAgentSetup: () => void;
  /** Leave the agent-setup view and stop polling. */
  onCloseAgentSetup: () => void;
  /** Send the brief to the (connected) daemon — only reachable once connected. */
  onSubmitToAgent: () => void;
  onCopyShareLink?: () => void;
  /** Open the extension Options page (for an `open-options` handoff action). */
  onOpenOptions?: () => void;
}

/**
 * Per-channel footer button configuration. Defaults reproduce the extension's
 * full set: a "Copy to clipboard" export plus "Send to agent" and "Copy share
 * link". A channel with a single delivery path — e.g. local-serve, where the
 * export sink *is* the agent submit — overrides these to surface one button
 * labelled for what it actually does.
 */
export interface PanelActions {
  /** Label for the primary export/submit button (default "Copy to clipboard"). */
  exportLabel?: string;
  /** Render the daemon-handoff "Send to agent" button (default true). */
  showSendToAgent?: boolean;
  /** Render the cross-machine "Copy share link" button (default true). */
  showShareLink?: boolean;
}

export interface PanelAppProps extends PanelHandlers {
  store: PanelStore;
  /** Footer button config; omit for the extension's full set. */
  actions?: PanelActions | undefined;
  /** UI appearance; `auto` defers to the OS. Static (not part of the snapshot). */
  theme?: ThemeMode | undefined;
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
  actions,
  theme,
  onSelectTool,
  onEditNote,
  onDelete,
  onClearAll,
  onExport,
  onShowAgentSetup,
  onCloseAgentSetup,
  onSubmitToAgent,
  onCopyShareLink,
  onOpenOptions,
}: PanelAppProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <PanelErrorBoundary>
      <ChangelogPanel
        annotations={snapshot.annotations}
        activeTool={snapshot.activeTool}
        handoff={snapshot.handoff}
        share={snapshot.share ?? null}
        placement={snapshot.placement ?? null}
        connection={snapshot.connection ?? null}
        actions={actions}
        theme={theme}
        onSelectTool={onSelectTool}
        onEditNote={onEditNote}
        onDelete={onDelete}
        onClearAll={onClearAll}
        onExport={onExport}
        onShowAgentSetup={onShowAgentSetup}
        onCloseAgentSetup={onCloseAgentSetup}
        onSubmitToAgent={onSubmitToAgent}
        onCopyShareLink={onCopyShareLink}
        onOpenOptions={onOpenOptions}
      />
    </PanelErrorBoundary>
  );
}
