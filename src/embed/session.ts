import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Overlay } from '@/src/overlay';
import {
  PanelApp,
  isolateKeyboard,
  type Handoff,
  type PanelSnapshot,
  type PanelStore,
  type ShareNotice,
} from '@/src/panel';
import {
  changelogReducer,
  renumberCallouts,
  type Changelog,
  type ChangelogAction,
  type ToolKind,
} from '@/src/core/model';
import { buildExportPayload, changelogToMarkdown, type ExportPayload } from '@/src/core/export';
import { deriveAgentConnection, type AgentConnection } from '@/src/core/agent';
import { buildBrief } from '@/src/core/share';
import {
  claimPendingImport,
  encodeToken,
  summarizePlacement,
  type PlacementSummary,
} from '@/src/share';
import { resolveGeometry, type ResolvedAnnotation } from '@/src/anchor';
import { compositeAnnotations, type CompositeDeps } from '@/src/capture/composite';
import type { RenderOptions } from '@/src/capture/render';
import type { AnnotationSession, HostAdapters } from './ports';

// The browser-free annotation orchestrator (SPEC §13.2). Everything that touched
// `browser.*` / the message bus has been pushed behind `HostAdapters`; what's left
// — the changelog state, the panel store, the overlay wiring, export/share/agent
// flows — is pure DOM + the already-browser-free core, so it runs under happy-dom
// and (later) any non-extension channel. This module must import none of
// `wxt/browser`, `wxt/utils/storage`, `@/src/messaging`, or the message-coupled
// capture sinks (`screenshot`/`clipboard-sink`/`daemon-sink`) — a test asserts it.

// The oldest `share-the-mark` daemon this build speaks to (SPEC §11.4). A declared
// floor — the two halves release independently.
const MIN_DAEMON_VERSION = '0.1.0';

// How often the agent-setup view re-checks the local daemon while it's open. Cheap
// loopback round-trips; cleared the moment the view closes (or the session unmounts).
const CONNECTION_POLL_MS = 2000;

// `deps` carries internal, non-host injection points (canvas plumbing for tests);
// the extension passes nothing and `compositeAnnotations` uses its default surface.
// Kept off `HostAdapters` so the host contract stays "host capabilities only".
export async function createAnnotationSession(
  adapters: HostAdapters,
  deps: { compositeDeps?: CompositeDeps } = {},
): Promise<AnnotationSession> {
  const now = adapters.now ?? (() => Date.now());
  const createId = adapters.createId ?? (() => crypto.randomUUID());

  // Independent reads — run them together so startup (the content-script injection
  // path) costs max(...) latency, not the sum of three storage round-trips.
  const [settings, stored, pending] = await Promise.all([
    adapters.getSettings(),
    adapters.changelog.load(location.href),
    adapters.pendingImport.load(),
  ]);

  const renderOptions: RenderOptions = {
    strokeColor: settings.strokeColor,
    strokeWidth: settings.strokeWidth,
    highlightColor: settings.highlightColor,
    scale: devicePixelRatio || 1,
  };

  let changelog: Changelog = stored ?? {
    id: createId(),
    url: location.href,
    title: document.title,
    capturedAt: now(),
    annotations: [],
  };

  let activeTool: ToolKind = settings.defaultTool;
  let handoff: Handoff | null = null;
  let share: ShareNotice | null = null;
  let placement: PlacementSummary | null = null;
  // Live daemon status while the agent-setup view is open; null when it's closed.
  let connection: AgentConnection | null = null;

  // Cross-machine import (SPEC §12): if the host stashed a brief for this URL and
  // the tab just landed here, hydrate the marks and summarize placement so they
  // render the moment the page is ready — no "Start annotating" click.
  const claimed = claimPendingImport({ pending, href: location.href, now: now() });
  if (claimed) {
    changelog = { ...changelog, annotations: renumberCallouts(claimed.annotations) };
    void adapters.pendingImport.clear();
    void adapters.changelog.save(changelog);
    placement = summarizePlacement(changelog.annotations, document);
  }

  // External store the panel subscribes to; React owns its own re-renders. Created
  // once and shared across remounts, so the same store instance backs each view.
  const buildSnapshot = (): PanelSnapshot => ({
    annotations: changelog.annotations,
    activeTool,
    handoff,
    share,
    placement,
    connection,
  });
  let snapshot: PanelSnapshot = buildSnapshot();
  const listeners = new Set<() => void>();
  const store: PanelStore = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
  function publish(): void {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener();
  }

  // The overlay only exists while a view is mounted; dispatch is session-level, so
  // it tolerates a null overlay (a state change while unmounted still persists).
  let overlay: Overlay | null = null;

  function dispatch(action: ChangelogAction): void {
    changelog = changelogReducer(changelog, action);
    overlay?.setAnnotations(changelog.annotations);
    void adapters.changelog.save(changelog);
    publish();
  }

  function setHandoff(next: Handoff | null): void {
    handoff = next;
    publish();
  }

  // Build the composited export payload (Markdown + annotated PNG). Returns null if
  // the screenshot/composite step fails (it needs a user gesture); the Markdown is
  // published to the dataset first for e2e/debugging either way.
  async function buildPayload(): Promise<ExportPayload | null> {
    const captured: Changelog = { ...changelog, capturedAt: now() };
    document.documentElement.dataset['stmLastExport'] = changelogToMarkdown(captured);
    try {
      const { dataUrl, offset } = await adapters.captureScreenshot();
      const resolved = captured.annotations
        .map((annotation) => resolveGeometry(annotation, document))
        .filter((value): value is ResolvedAnnotation => value !== null);
      // Shift the marks by the capture's document origin (0 for a viewport capture,
      // scroll for full-page). Per-call, not baked into `renderOptions` — that same
      // object backs the live overlay, which must stay offset-free.
      const image = await compositeAnnotations(
        dataUrl,
        resolved,
        { ...renderOptions, offsetX: offset.x, offsetY: offset.y },
        deps.compositeDeps,
      );
      return await buildExportPayload(captured, image);
    } catch {
      return null;
    }
  }

  // Copy a cross-machine share token (SPEC §12): the annotation model for this URL,
  // gzipped — no screenshot. The recipient pastes it into their extension, which
  // opens the page and re-renders the marks against the live DOM.
  async function copyShareLink(): Promise<void> {
    const captured: Changelog = { ...changelog, capturedAt: now() };
    const token = await encodeToken(buildBrief(captured));
    // Publish for e2e/debugging before the clipboard write (which needs a gesture).
    document.documentElement.dataset['stmLastShare'] = token;
    try {
      await adapters.clipboard.writeText(token);
      share = { kind: 'copied' };
    } catch {
      share = { kind: 'error', message: 'couldn’t copy the share link' };
    }
    publish();
  }

  async function runExport(): Promise<void> {
    const payload = await buildPayload();
    if (!payload) return;
    if (await adapters.exportSink.isAvailable()) await adapters.exportSink.write(payload);
  }

  // The agent-setup view's live "is the daemon up?" check (SPEC §5.4 redesign).
  // Permission first (a denied fetch never reaches the daemon), then a `/health`
  // read; `deriveAgentConnection` folds in the version handshake (SPEC §11.4). The
  // result gates the send button, so the user sees *why* a send can't happen.
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function refreshConnection(): Promise<void> {
    const isPermitted = await adapters.daemon.permitted();
    const health = isPermitted ? await adapters.daemon.health() : null;
    connection = deriveAgentConnection({
      permitted: isPermitted,
      health,
      extensionVersion: adapters.getVersion(),
      minDaemonVersion: MIN_DAEMON_VERSION,
    });
    publish();
  }

  function stopPolling(): void {
    if (pollTimer === null) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // Open the connect view: clear any stale handoff, show a neutral "checking" state,
  // then poll until the view closes.
  function openAgentView(): void {
    handoff = null;
    connection = { status: 'checking' };
    publish();
    void refreshConnection();
    pollTimer ??= setInterval(() => void refreshConnection(), CONNECTION_POLL_MS);
  }

  function closeAgentView(): void {
    stopPolling();
    connection = null;
    publish();
  }

  // Send the brief to the (already-connected) daemon and surface the handoff token.
  // Reachability/permission/version are gated by the connect view, so this just
  // builds the payload and writes; a daemon that dropped since the last poll surfaces
  // as the generic write failure.
  async function submitToAgent(): Promise<void> {
    const payload = await buildPayload();
    if (!payload) return;
    try {
      const result = await adapters.daemon.sink.write(payload);
      if (result.ref) setHandoff({ kind: 'sent', command: `share-the-mark show ${result.ref}` });
    } catch {
      setHandoff({ kind: 'error', message: 'failed to send to the daemon' });
    }
  }

  let releaseKeyboard: (() => void) | null = null;
  let panelRoot: Root | null = null;

  function mountView(container: HTMLElement): void {
    // Keep our UI's keystrokes (notes, text annotations) from leaking to the host
    // page, whose single-key shortcuts would otherwise fire while typing.
    releaseKeyboard = isolateKeyboard(container);

    const panelHost = document.createElement('div');
    panelHost.className = 'stm-host';
    container.append(panelHost);
    panelRoot = createRoot(panelHost);

    overlay = new Overlay({
      container,
      tool: settings.defaultTool,
      settings: renderOptions,
      onCreate: (annotation) => {
        dispatch({ type: 'add', annotation });
      },
      onUpdate: (annotation) => {
        dispatch({ type: 'update', annotation });
      },
    });

    panelRoot.render(
      createElement(PanelApp, {
        store,
        capabilities: adapters.capabilities,
        theme: settings.theme,
        onSelectTool: (tool) => {
          activeTool = tool;
          overlay?.setTool(tool);
          publish();
        },
        onEditNote: (id, note) => {
          dispatch({ type: 'updateNote', id, note });
        },
        onDelete: (id) => {
          dispatch({ type: 'remove', id });
        },
        onClearAll: () => {
          dispatch({ type: 'replaceAll', annotations: [] });
        },
        onExport: () => {
          void runExport();
        },
        onShowAgentSetup: openAgentView,
        onCloseAgentSetup: closeAgentView,
        onSubmitToAgent: () => {
          void submitToAgent();
        },
        onCopyShareLink: () => {
          void copyShareLink();
        },
        onOpenOptions: () => {
          adapters.openOptions();
        },
      }),
    );

    overlay.setAnnotations(changelog.annotations);
    publish();
  }

  function unmountView(): void {
    stopPolling();
    connection = null;
    releaseKeyboard?.();
    overlay?.destroy();
    panelRoot?.unmount();
    releaseKeyboard = null;
    overlay = null;
    panelRoot = null;
  }

  return { mountView, unmountView, exportAnnotations: runExport };
}
