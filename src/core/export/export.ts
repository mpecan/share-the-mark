import type { Annotation, CalloutAnnotation, Changelog } from '@/src/core/model';

// Export payload, the ExportSink interface, and the stable Markdown changelog
// format — SPEC §5.4. Pure: the composited screenshot Blob is produced by the
// capture layer and handed in here. M1 ships one sink (ClipboardSink, in the
// content-script layer); further sinks plug into this interface in M2.

export interface ExportMeta {
  url: string;
  title: string;
  capturedAt: number;
}

export interface ExportPayload {
  /** The changelog rendered as Markdown. */
  markdown: string;
  /** PNG: the screenshot with annotations already composited. */
  image: Blob;
  meta: ExportMeta;
}

/** Outcome of a write — e.g. a reference an agent can fetch by. */
export interface ExportResult {
  /** A handle for the written brief (the daemon sink returns the brief id). */
  ref?: string;
}

export interface ExportSink {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  write(payload: ExportPayload): Promise<ExportResult>;
}

function annotationLabel(annotation: Annotation): string {
  const note = annotation.note?.trim() ?? '';
  return note === '' ? `(${annotation.kind})` : note;
}

// Callouts first, by their 1-based index; then everything else by creation time.
function orderAnnotations(annotations: readonly Annotation[]): Annotation[] {
  const callouts = annotations
    .filter((a): a is CalloutAnnotation => a.kind === 'callout')
    .toSorted((a, b) => a.index - b.index);
  const others = annotations
    .filter((a) => a.kind !== 'callout')
    .toSorted((a, b) => a.createdAt - b.createdAt);
  return [...callouts, ...others];
}

export function changelogToMarkdown(changelog: Changelog): string {
  const captured = new Date(changelog.capturedAt).toISOString();
  const header = [
    `# Change brief — ${changelog.title}`,
    `Source: ${changelog.url}`,
    `Captured: ${captured}`,
  ].join('\n');

  const items = orderAnnotations(changelog.annotations).map((annotation, i) => {
    return [
      `${String(i + 1)}. ${annotationLabel(annotation)}`,
      `   Element: \`${annotation.target.selector}\``,
    ].join('\n');
  });

  return items.length === 0 ? header : `${header}\n\n${items.join('\n')}`;
}

export function buildExportPayload(changelog: Changelog, screenshot: Blob): Promise<ExportPayload> {
  return Promise.resolve({
    markdown: changelogToMarkdown(changelog),
    image: screenshot,
    meta: {
      url: changelog.url,
      title: changelog.title,
      capturedAt: changelog.capturedAt,
    },
  });
}
