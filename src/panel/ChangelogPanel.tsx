import type { JSX } from 'react';
import type { Annotation, ToolKind } from '@/src/core/model';

// In-page changelog panel (SPEC §5.8). Rendered with React into the closed
// shadow root alongside the overlay. Static-ish UI only — the hot drawing path
// stays imperative (SPEC §5.1). Styling lives in src/panel/panel.css, which WXT
// injects into the shadow root (cssInjectionMode: 'ui').

export interface ChangelogPanelProps {
  annotations: readonly Annotation[];
  activeTool: ToolKind;
  onSelectTool: (tool: ToolKind) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
}

const ICONS: Record<ToolKind, JSX.Element> = {
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

const TOOLS: ToolKind[] = ['callout', 'text', 'arrow', 'highlight', 'element'];

function badge(annotation: Annotation): string {
  return annotation.kind === 'callout' ? String(annotation.index) : '•';
}

export function ChangelogPanel({
  annotations,
  activeTool,
  onSelectTool,
  onEditNote,
  onDelete,
  onExport,
}: ChangelogPanelProps): JSX.Element {
  return (
    <section className="stm-panel" aria-label="Changelog">
      <header className="stm-panel__head">
        <span className="stm-panel__brand">share&nbsp;the&nbsp;mark</span>
        <span className="stm-panel__count">{annotations.length}</span>
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

      <div className="stm-panel__body">
        {annotations.length === 0 ? (
          <p className="stm-panel__empty">No annotations yet. Pick a tool and draw on the page.</p>
        ) : (
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
        )}
      </div>

      <footer className="stm-panel__foot">
        <button
          type="button"
          className="stm-panel__export"
          onClick={onExport}
          disabled={annotations.length === 0}
        >
          Copy to clipboard
        </button>
      </footer>
    </section>
  );
}
