import type { JSX } from 'react';
import type { Annotation } from '@/src/core/model';

// In-page changelog panel (SPEC §5.8). Rendered with React into the closed
// shadow root alongside the overlay. Static-ish UI only — the hot drawing path
// stays imperative (SPEC §5.1).

export interface ChangelogPanelProps {
  annotations: readonly Annotation[];
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
}

function badge(annotation: Annotation): string {
  return annotation.kind === 'callout' ? String(annotation.index) : '•';
}

export function ChangelogPanel({
  annotations,
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

      {annotations.length === 0 ? (
        <p className="stm-panel__empty">No annotations yet. Draw on the page to begin.</p>
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
