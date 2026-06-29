import { useState, type JSX } from 'react';
import { useCopy } from '@/src/ui/use-copy';
import { Button } from '@/src/ui/Button';
import { TOOL_KINDS, type Annotation, type ToolKind } from '@/src/core/model';
import type { AgentConnection } from '@/src/core/agent';
import type { ThemeMode } from '@/src/storage/settings-defaults';
import { DAEMON_START_COMMAND, HUB_URL } from '@/src/core/links';
import type { PlacementSummary } from '@/src/share';
import type { Handoff, HandoffAction, ShareNotice } from './PanelApp';
import { DEFAULT_CAPABILITIES, type PanelCapabilities } from './capabilities';

// In-page changelog panel (SPEC §5.8). Rendered with React into the closed
// shadow root alongside the overlay. Static-ish UI only — the hot drawing path
// stays imperative (SPEC §5.1). Styling lives in src/panel/panel.css, which WXT
// injects into the shadow root (cssInjectionMode: 'ui').

export interface ChangelogPanelProps {
  annotations: readonly Annotation[];
  activeTool: ToolKind;
  handoff: Handoff | null;
  share?: ShareNotice | null;
  placement?: PlacementSummary | null;
  /** Live daemon-connection status while the agent-setup view is open. */
  connection?: AgentConnection | null;
  onSelectTool: (tool: ToolKind) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onExport: () => void;
  /** Footer "Send to agent" — opens the connect view and starts polling. */
  onShowAgentSetup: () => void;
  /** Back out of the connect view — stops polling. */
  onCloseAgentSetup: () => void;
  /** Send the brief once the daemon is connected. */
  onSubmitToAgent: () => void;
  onCopyShareLink?: (() => void) | undefined;
  onOpenOptions?: (() => void) | undefined;
  /** Host capabilities that gate the footer actions; omit for the full set. */
  capabilities?: PanelCapabilities | undefined;
  /** UI appearance; `auto`/undefined defers to the OS via prefers-color-scheme. */
  theme?: ThemeMode | undefined;
}

/** A footer button derived from a declared capability (SPEC §13.6). */
interface FooterAction {
  id: string;
  label: string;
  variant: 'primary' | 'secondary';
  onInvoke: () => void;
}

const ICONS: Record<ToolKind, JSX.Element> = {
  select: <path d="M3 2l9 4.5-3.7 1.2L7 12 3 2z" fill="currentColor" stroke="none" />,
  callout: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  text: <path d="M3 4h10M8 4.5v8M6 12.5h4" />,
  arrow: <path d="M3 13L13 3M7.5 3H13v5.5" />,
  highlight: (
    <>
      <rect
        x="2"
        y="7.5"
        width="12"
        height="3.2"
        rx="1"
        fill="currentColor"
        stroke="none"
        opacity="0.45"
      />
      <path d="M2.5 13h11" />
    </>
  ),
  element: <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" strokeDasharray="3 2" />,
};

function badge(annotation: Annotation): string {
  return annotation.kind === 'callout' ? String(annotation.index) : '•';
}

// An error handoff's call-to-action: an external link (the hub) or a button that
// opens the extension Options page (content scripts can't, so it calls back out).
function HandoffActionControl({
  action,
  onOpenOptions,
}: {
  action: HandoffAction;
  onOpenOptions?: (() => void) | undefined;
}): JSX.Element {
  if ('href' in action) {
    return (
      <a className="stm-panel__handoff-action" href={action.href} target="_blank" rel="noreferrer">
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" className="stm-panel__handoff-action" onClick={onOpenOptions}>
      {action.label}
    </button>
  );
}

// The handoff line shared by the list footer and the agent-setup view: the
// success command to paste, or an error with its optional call-to-action.
function HandoffLine({
  handoff,
  onOpenOptions,
}: {
  handoff: Handoff;
  onOpenOptions?: (() => void) | undefined;
}): JSX.Element {
  if (handoff.kind === 'sent') {
    return (
      <p className="stm-panel__handoff">
        ✓ sent — paste to your agent: <code>{handoff.command}</code>
      </p>
    );
  }
  return (
    <p className="stm-panel__handoff stm-panel__handoff--error">
      {handoff.message}
      {handoff.action != null && (
        <HandoffActionControl action={handoff.action} onOpenOptions={onOpenOptions} />
      )}
    </p>
  );
}

function incompatibleMessage(c: Extract<AgentConnection, { status: 'incompatible' }>): string {
  return c.reason === 'daemon-too-old'
    ? `Your share-the-mark CLI is out of date (need ≥ ${c.need}). Update it and retry.`
    : `Update the share-the-mark extension (the CLI needs ≥ ${c.need}) and retry.`;
}

// "Send to agent" connect view (SPEC §5.4 redesign). Polls the local daemon and
// only unlocks the send once it's reachable and version-compatible — so the user
// sees *why* a send can't happen (no permission, no daemon, wrong version) instead
// of a one-line failure after the fact.
function AgentSetupView({
  connection,
  count,
  handoff,
  onBack,
  onSubmit,
  onOpenOptions,
}: {
  connection: AgentConnection | null;
  count: number;
  handoff: Handoff | null;
  onBack: () => void;
  onSubmit: () => void;
  onOpenOptions?: (() => void) | undefined;
}): JSX.Element {
  const { copied, copy } = useCopy();
  const status = connection?.status ?? 'checking';

  return (
    <div className="stm-agent">
      <header className="stm-agent__head">
        <button type="button" className="stm-agent__back" aria-label="Back" onClick={onBack}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M14 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="stm-agent__title">Send to agent</span>
      </header>

      <div className="stm-agent__body">
        {status === 'not-permitted' && (
          <p className="stm-agent__lead">
            Enable <strong>Agent integration</strong> in the extension Options to reach your local
            agent.
            <HandoffActionControl
              action={{ label: 'Open setup', kind: 'open-options' }}
              onOpenOptions={onOpenOptions}
            />
          </p>
        )}

        {(status === 'disconnected' || status === 'checking') && (
          <>
            <p className="stm-agent__lead">
              Connect Share the Mark to your local agent. Install the CLI, then run this once — it
              starts the daemon in the background:
            </p>
            <div className="stm-agent__cmd">
              <span className="stm-agent__cmd-prompt" aria-hidden="true">
                $
              </span>
              <code>{DAEMON_START_COMMAND}</code>
              <Button
                variant="secondary"
                className="stm-agent__copy"
                onClick={() => {
                  copy(DAEMON_START_COMMAND);
                }}
              >
                {copied === DAEMON_START_COMMAND ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="stm-agent__status" role="status">
              <span className="stm-agent__dot" aria-hidden="true" />
              {status === 'checking'
                ? 'Checking for the local agent…'
                : 'Waiting for the CLI to connect…'}
            </div>
            {onOpenOptions && (
              <p className="stm-agent__alt">
                Don’t have the CLI yet?
                <HandoffActionControl
                  action={{ label: 'Set it up', kind: 'open-options' }}
                  onOpenOptions={onOpenOptions}
                />
              </p>
            )}
          </>
        )}

        {connection?.status === 'incompatible' && (
          <p className="stm-agent__lead">
            {incompatibleMessage(connection)}
            <a
              className="stm-panel__handoff-action"
              href={HUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              How to update
            </a>
          </p>
        )}

        {connection?.status === 'connected' && (
          <>
            <div className="stm-agent__ok" role="status">
              <span className="stm-agent__ok-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <div className="stm-agent__ok-title">Connected to the local daemon</div>
                <div className="stm-agent__ok-meta">
                  {connection.version != null && <>share-the-mark v{connection.version} · </>}
                  {connection.address} · ready
                </div>
              </div>
            </div>
            <p className="stm-agent__lead">
              Your {count} mark{count === 1 ? '' : 's'} go with the page URL, anchors, and a
              screenshot.
            </p>
          </>
        )}

        <Button
          variant="primary"
          className="stm-agent__send"
          onClick={onSubmit}
          disabled={status !== 'connected' || count === 0}
        >
          Send {count} mark{count === 1 ? '' : 's'}
        </Button>

        {handoff !== null && <HandoffLine handoff={handoff} onOpenOptions={onOpenOptions} />}
      </div>
    </div>
  );
}

export function ChangelogPanel({
  annotations,
  activeTool,
  handoff,
  share,
  placement,
  connection,
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
  capabilities,
  theme,
}: ChangelogPanelProps): JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [view, setView] = useState<'list' | 'agent'>('list');
  const themeAttr = theme === undefined || theme === 'auto' ? undefined : theme;

  // The footer is a declarative action list: one entry per declared capability
  // (SPEC §13.6). Adding an action is one entry here, not a flag threaded through
  // mount → session → panel. Each channel supplies its own capability set.
  const caps = capabilities ?? DEFAULT_CAPABILITIES;
  const footerActions: FooterAction[] = [
    { id: 'export', label: caps.exportLabel, variant: 'primary', onInvoke: onExport },
  ];
  if (caps.agentHandoff) {
    footerActions.push({
      id: 'agent',
      label: 'Send to agent',
      variant: 'secondary',
      onInvoke: () => {
        setView('agent');
        onShowAgentSetup();
      },
    });
  }
  if (caps.shareLink) {
    footerActions.push({
      id: 'share',
      label: 'Copy share link',
      variant: 'secondary',
      // Declaring the capability implies a wired handler (session.ts always passes
      // one); guard anyway so a bare ChangelogPanel can't throw on click.
      onInvoke: () => onCopyShareLink?.(),
    });
  }

  if (view === 'agent') {
    return (
      <section className="stm-panel" data-theme={themeAttr} aria-label="Send to agent">
        <AgentSetupView
          connection={connection ?? null}
          count={annotations.length}
          handoff={handoff}
          onBack={() => {
            setView('list');
            onCloseAgentSetup();
          }}
          onSubmit={onSubmitToAgent}
          onOpenOptions={onOpenOptions}
        />
      </section>
    );
  }

  return (
    <section
      className="stm-panel"
      data-collapsed={isCollapsed}
      data-theme={themeAttr}
      aria-label="Changelog"
    >
      <header className="stm-panel__head">
        <span className="stm-panel__brand">share&nbsp;the&nbsp;mark</span>
        <span className="stm-panel__count">{annotations.length}</span>
        <button
          type="button"
          className="stm-panel__toggle"
          aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-expanded={!isCollapsed}
          onClick={() => {
            setIsCollapsed((value) => !value);
          }}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M4 10l4-4 4 4" />
          </svg>
        </button>
      </header>

      <div className="stm-panel__tools" role="toolbar" aria-label="Annotation tools">
        {TOOL_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="stm-tool"
            aria-label={kind}
            aria-pressed={kind === activeTool}
            title={kind}
            onClick={() => {
              onSelectTool(kind);
            }}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              {ICONS[kind]}
            </svg>
          </button>
        ))}
      </div>
      <p className="stm-panel__active">
        Tool: <strong>{activeTool}</strong>
      </p>

      {placement != null && (
        <div className="stm-panel__placement" role="status">
          <p>
            Placed <strong>{placement.placed}</strong> of {placement.total} shared marks.
          </p>
          {placement.orphans.length > 0 && (
            <>
              <p className="stm-panel__placement-note">
                This page changed since capture — these couldn’t be placed:
              </p>
              <ul className="stm-panel__orphans">
                {placement.orphans.map((orphan) => (
                  <li key={orphan.id}>{orphan.label}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="stm-panel__body">
        {annotations.length === 0 ? (
          <div className="stm-panel__empty">
            <span className="stm-empty__pulse" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" width="30" height="30">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="3.4" fill="currentColor" />
              </svg>
            </span>
            <span className="stm-empty__title">No marks yet</span>
            <span className="stm-empty__hint">
              Pick a tool above, then draw on the page to drop your first anchored mark.
            </span>
          </div>
        ) : (
          <>
            <div className="stm-panel__listhead">
              {isConfirmingClear ? (
                <span className="stm-panel__confirm">
                  Clear {annotations.length}?
                  <button
                    type="button"
                    className="stm-panel__confirm-yes"
                    onClick={() => {
                      onClearAll();
                      setIsConfirmingClear(false);
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="stm-panel__confirm-no"
                    onClick={() => {
                      setIsConfirmingClear(false);
                    }}
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="stm-panel__clear"
                  onClick={() => {
                    setIsConfirmingClear(true);
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
            <ol className="stm-panel__list">
              {annotations.map((annotation) => (
                <li key={annotation.id} className="stm-item">
                  <span className="stm-item__badge" data-kind={annotation.kind} aria-hidden="true">
                    {badge(annotation)}
                  </span>
                  <input
                    className="stm-item__note"
                    type="text"
                    placeholder={`${annotation.kind} note`}
                    aria-label={`Note for ${annotation.kind} annotation`}
                    value={annotation.note ?? ''}
                    onChange={(event) => {
                      onEditNote(annotation.id, event.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="stm-item__del"
                    aria-label={`Delete ${annotation.kind} annotation`}
                    onClick={() => {
                      onDelete(annotation.id);
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      <footer className="stm-panel__foot">
        <div className="stm-panel__actions">
          {footerActions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant}
              onClick={action.onInvoke}
              disabled={annotations.length === 0}
            >
              {action.label}
            </Button>
          ))}
        </div>
        {handoff !== null && <HandoffLine handoff={handoff} onOpenOptions={onOpenOptions} />}
        {share != null &&
          (share.kind === 'copied' ? (
            <p className="stm-panel__handoff">✓ share link copied — paste it to a teammate.</p>
          ) : (
            <p className="stm-panel__handoff stm-panel__handoff--error">{share.message}</p>
          ))}
      </footer>
    </section>
  );
}
