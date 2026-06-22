import { useState, type JSX } from 'react';
import type { Annotation, ToolKind } from '@/src/core/model';
import type { PlacementSummary } from '@/src/share';
import type { Handoff, HandoffAction, PanelActions, ShareNotice } from './PanelApp';

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
  onSelectTool: (tool: ToolKind) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onExport: () => void;
  onSendToAgent: () => void;
  onCopyShareLink?: (() => void) | undefined;
  onOpenOptions?: (() => void) | undefined;
  actions?: PanelActions | undefined;
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

const TOOLS: ToolKind[] = ['select', 'callout', 'text', 'arrow', 'highlight', 'element'];

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

export function ChangelogPanel({
  annotations,
  activeTool,
  handoff,
  share,
  placement,
  onSelectTool,
  onEditNote,
  onDelete,
  onClearAll,
  onExport,
  onSendToAgent,
  onCopyShareLink,
  onOpenOptions,
  actions,
}: ChangelogPanelProps): JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const exportLabel = actions?.exportLabel ?? 'Copy to clipboard';
  return (
    <section className="stm-panel" data-collapsed={isCollapsed} aria-label="Changelog">
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
        {TOOLS.map((kind) => (
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
          <p className="stm-panel__empty">No annotations yet. Pick a tool and draw on the page.</p>
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
          <button
            type="button"
            className="stm-panel__export"
            onClick={onExport}
            disabled={annotations.length === 0}
          >
            {exportLabel}
          </button>
          {(actions?.showSendToAgent ?? true) && (
            <button
              type="button"
              className="stm-panel__send"
              onClick={onSendToAgent}
              disabled={annotations.length === 0}
            >
              Send to agent
            </button>
          )}
          {(actions?.showShareLink ?? true) && (
            <button
              type="button"
              className="stm-panel__share"
              onClick={onCopyShareLink}
              disabled={annotations.length === 0}
            >
              Copy share link
            </button>
          )}
        </div>
        {handoff !== null &&
          (handoff.kind === 'sent' ? (
            <p className="stm-panel__handoff">
              ✓ sent — paste to your agent: <code>{handoff.command}</code>
            </p>
          ) : (
            <p className="stm-panel__handoff stm-panel__handoff--error">
              {handoff.message}
              {handoff.action != null && (
                <HandoffActionControl action={handoff.action} onOpenOptions={onOpenOptions} />
              )}
            </p>
          ))}
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
