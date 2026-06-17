import type { JSX } from 'react';
import type { Annotation, ToolKind } from '@/src/core/model';

// In-page changelog panel (SPEC §5.8). Rendered with React into the closed
// shadow root alongside the overlay. Static-ish UI only — the hot drawing path
// stays imperative (SPEC §5.1).

export interface ChangelogPanelProps {
  annotations: readonly Annotation[];
  activeTool: ToolKind;
  onSelectTool: (tool: ToolKind) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
}

const TOOLS: { kind: ToolKind; glyph: string }[] = [
  { kind: 'callout', glyph: '①' },
  { kind: 'pencil', glyph: '✏' },
  { kind: 'arrow', glyph: '↗' },
  { kind: 'rectangle', glyph: '▭' },
  { kind: 'ellipse', glyph: '◯' },
  { kind: 'text', glyph: 'T' },
  { kind: 'highlight', glyph: '▒' },
];

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
    <section aria-label="Changelog" className="stm-panel">
      <header className="stm-panel__header">
        <h1>Changelog</h1>
        <button type="button" onClick={onExport} disabled={annotations.length === 0}>
          Copy to clipboard
        </button>
      </header>

      <div className="stm-panel__tools" role="toolbar" aria-label="Annotation tools">
        {TOOLS.map(({ kind, glyph }) => (
          <button
            key={kind}
            type="button"
            className="stm-panel__tool"
            aria-label={kind}
            aria-pressed={kind === activeTool}
            title={kind}
            onClick={() => {
              onSelectTool(kind);
            }}
          >
            {glyph}
          </button>
        ))}
      </div>

      {annotations.length === 0 ? (
        <p className="stm-panel__empty">No annotations yet. Pick a tool and draw on the page.</p>
      ) : (
        <ol className="stm-panel__list">
          {annotations.map((annotation) => (
            <li key={annotation.id} className="stm-panel__item">
              <span className="stm-panel__badge" aria-hidden="true">
                {badge(annotation)}
              </span>
              <input
                className="stm-panel__note"
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
    </section>
  );
}
