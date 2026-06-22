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
import { checkDaemonCompat, type DaemonCompat } from '@/src/core/version';
import { HUB_URL } from '@/src/core/links';
import { buildBrief } from '@/src/core/share';
import {
  claimPendingImport,
  encodeToken,
  summarizePlacement,
  type PlacementSummary,
} from '@/src/share';
import { resolveGeometry, type ResolvedAnnotation } from '@/src/anchor';
import { compositeAnnotations } from '@/src/capture/composite';
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

function compatHandoff(compat: Extract<DaemonCompat, { ok: false }>): Handoff {
  const message =
    compat.reason === 'daemon-too-old'
      ? `your share-the-mark CLI is out of date (need ≥ ${compat.need}) — update it and retry`
      : `update the share-the-mark extension (the CLI needs ≥ ${compat.need}) and retry`;
  return { kind: 'error', message, action: { label: 'How to update', href: HUB_URL } };
}

export async function createAnnotationSession(adapters: HostAdapters): Promise<AnnotationSession> {
  const now = adapters.now ?? (() => Date.now());
  const createId = adapters.createId ?? (() => crypto.randomUUID());

  const settings = await adapters.getSettings();
  const renderOptions: RenderOptions = {
    strokeColor: settings.strokeColor,
    strokeWidth: settings.strokeWidth,
    highlightColor: settings.highlightColor,
    scale: devicePixelRatio || 1,
  };

  let changelog: Changelog = (await adapters.changelog.load(location.href)) ?? {
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

  // Cross-machine import (SPEC §12): if the host stashed a brief for this URL and
  // the tab just landed here, hydrate the marks and summarize placement so they
  // render the moment the page is ready — no "Start annotating" click.
  const claimed = claimPendingImport({
    pending: await adapters.pendingImport.load(),
    href: location.href,
    now: now(),
  });
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
      const screenshot = await adapters.captureScreenshot();
      const resolved = captured.annotations
        .map((annotation) => resolveGeometry(annotation, document))
        .filter((value): value is ResolvedAnnotation => value !== null);
      const image = await compositeAnnotations(
        screenshot,
        resolved,
        renderOptions,
        adapters.compositeDeps,
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

  async function exportToClipboard(): Promise<void> {
    const payload = await buildPayload();
    if (!payload) return;
    if (await adapters.clipboardSink.isAvailable()) await adapters.clipboardSink.write(payload);
  }

  // Send the brief to the local `share-the-mark` daemon and surface the handoff token.
  // TODO(step 2): the error-handoff copy and the `open-options` action are
  // extension-specific UI; a non-extension channel has no Options page. Extract a
  // handoff *presenter* (core emits structured reason codes, the host phrases them)
  // when the embed channels land. Kept inline here for a zero-behavior-change lift.
  async function sendToAgent(): Promise<void> {
    // The loopback host permission is opt-in; without it the background fetch can't
    // reach the daemon, so guide the user to enable it rather than build a payload
    // (a screenshot capture) we can't deliver.
    if (!(await adapters.daemon.permitted())) {
      setHandoff({
        kind: 'error',
        message: 'enable “Agent integration” in the extension Options to send to an agent',
        action: { label: 'Open setup', kind: 'open-options' },
      });
      return;
    }
    const health = await adapters.daemon.health();
    if (!health.reachable) {
      setHandoff({
        kind: 'error',
        message: 'no daemon yet — install the share-the-mark CLI, then run `share-the-mark serve`',
        action: { label: 'Open setup', kind: 'open-options' },
      });
      return;
    }
    // Version handshake (SPEC §11.4): warn on a floor mismatch instead of sending to
    // a daemon that can't read the brief — before paying for a screenshot.
    const compat = checkDaemonCompat({
      extensionVersion: adapters.getVersion(),
      minDaemonVersion: MIN_DAEMON_VERSION,
      daemonVersion: health.version,
      daemonMinExtension: health.minExtension,
    });
    if (!compat.ok) {
      setHandoff(compatHandoff(compat));
      return;
    }
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
          void exportToClipboard();
        },
        onSendToAgent: () => {
          void sendToAgent();
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
    releaseKeyboard?.();
    overlay?.destroy();
    panelRoot?.unmount();
    releaseKeyboard = null;
    overlay = null;
    panelRoot = null;
  }

  return { mountView, unmountView, exportAnnotations: exportToClipboard };
}
