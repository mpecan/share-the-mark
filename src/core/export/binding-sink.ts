import type { ExportPayload, ExportResult, ExportSink } from './export';

// An ExportSink that hands the composited payload to an injected callback instead
// of touching the clipboard (SPEC §13.3). The non-extension channels inject this:
// Playwright wires the callback to `exposeBinding` (page → Node), and the local-
// serve channel POSTs from it. Load-bearing because a headless `ClipboardItem`
// with `image/png` fails in Chromium (Playwright #24039) — so automation can't go
// through `ClipboardSink`. Pure (it only holds a function), so it lives in
// `src/core/export` with the interface it implements, not in the browser-coupled
// `src/capture` alongside `ClipboardSink`/`DaemonSink`.
export class BindingSink implements ExportSink {
  readonly id = 'binding';
  private readonly deliver: (payload: ExportPayload) => Promise<void>;

  constructor(deliver: (payload: ExportPayload) => Promise<void>) {
    // A field copy, not a captured scope — cheap, and nothing else is retained.
    this.deliver = deliver;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async write(payload: ExportPayload): Promise<ExportResult> {
    await this.deliver(payload);
    return {};
  }
}
