import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { onMessage, sendMessage } from '@/src/messaging';
import { checkDaemonCompat, type DaemonCompat } from '@/src/core/version';
import { HUB_URL } from '@/src/core/links';
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
import { buildBrief } from '@/src/core/share';
import {
  claimPendingImport,
  encodeToken,
  summarizePlacement,
  type PlacementSummary,
} from '@/src/share';
import {
  clearPendingImport,
  getSettings,
  loadChangelog,
  loadPendingImport,
  saveChangelog,
} from '@/src/storage';
import { resolveGeometry } from '@/src/anchor';
import {
  ClipboardSink,
  DaemonSink,
  compositeAnnotations,
  requestScreenshot,
  type RenderOptions,
} from '@/src/capture';
import '@/src/panel/panel.css';

// The oldest `share-the-mark` daemon this extension speaks to (SPEC §11.4). A
// declared floor — the two halves release independently.
const MIN_DAEMON_VERSION = '0.1.0';

function compatHandoff(compat: Extract<DaemonCompat, { ok: false }>): Handoff {
  const message =
    compat.reason === 'daemon-too-old'
      ? `your share-the-mark CLI is out of date (need ≥ ${compat.need}) — update it and retry`
      : `update the share-the-mark extension (the CLI needs ≥ ${compat.need}) and retry`;
  return { kind: 'error', message, action: { label: 'How to update', href: HUB_URL } };
}

// Injected on demand under `activeTab` (no broad host permission) — see
// entrypoints/background.ts. `registration: 'runtime'` keeps the script out of the
// manifest's `content_scripts`, so the install requests no host access. The e2e
// build re-adds a static, fixture-scoped registration in the wxt.config hook (since
// headless Chromium can't gesture-grant activeTab).
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // The background injects on demand and may hit a tab that already ran the
    // script (e.g. the import path), so guard against a double mount.
    if (document.documentElement.dataset['stmInjected'] === 'true') return;
    document.documentElement.dataset['stmInjected'] = 'true';

    const settings = await getSettings();
    const tabId = await sendMessage('getTabId', undefined);
    const renderOptions: RenderOptions = {
      strokeColor: settings.strokeColor,
      strokeWidth: settings.strokeWidth,
      highlightColor: settings.highlightColor,
      scale: devicePixelRatio || 1,
    };

    let changelog: Changelog = (await loadChangelog(tabId, location.href)) ?? {
      id: crypto.randomUUID(),
      url: location.href,
      title: document.title,
      capturedAt: Date.now(),
      annotations: [],
    };

    let activeTool: ToolKind = settings.defaultTool;
    let handoff: Handoff | null = null;
    let share: ShareNotice | null = null;
    let placement: PlacementSummary | null = null;

    // Cross-machine import (SPEC §12): if the popup stashed a brief for this URL
    // and the tab just landed here, hydrate the marks and summarize placement so
    // they render the moment the page is ready — no "Start annotating" click.
    const claimed = claimPendingImport({
      pending: await loadPendingImport(),
      href: location.href,
      now: Date.now(),
    });
    if (claimed) {
      changelog = { ...changelog, annotations: renumberCallouts(claimed.annotations) };
      void clearPendingImport();
      void saveChangelog(tabId, changelog);
      placement = summarizePlacement(changelog.annotations, document);
    }

    // External store the panel subscribes to; React owns its own re-renders.
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

    const ui = await createShadowRootUi(ctx, {
      name: 'share-the-mark',
      position: 'overlay',
      anchor: 'body',
      append: 'last',
      mode: 'closed',
      onMount: (container) => {
        // Keep our UI's keystrokes (notes, text annotations) from leaking to the
        // host page, whose single-key shortcuts would otherwise fire while typing.
        const releaseKeyboard = isolateKeyboard(container);

        const panelHost = document.createElement('div');
        panelHost.className = 'stm-host';
        container.append(panelHost);
        const panelRoot = createRoot(panelHost);

        const overlay = new Overlay({
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

        function dispatch(action: ChangelogAction): void {
          changelog = changelogReducer(changelog, action);
          overlay.setAnnotations(changelog.annotations);
          void saveChangelog(tabId, changelog);
          publish();
        }

        panelRoot.render(
          createElement(PanelApp, {
            store,
            onSelectTool: (tool) => {
              activeTool = tool;
              overlay.setTool(tool);
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
              void sendMessage('openOptions', undefined);
            },
          }),
        );

        overlay.setAnnotations(changelog.annotations);
        publish();
        return { overlay, panelRoot, releaseKeyboard };
      },
      onRemove: (mounted) => {
        mounted?.releaseKeyboard();
        mounted?.overlay.destroy();
        mounted?.panelRoot.unmount();
      },
    });

    // Injecting the content script *is* the activation — mount immediately. (Re-
    // activation after Stop goes through the activateAnnotationMode message below.)
    ui.mount();

    // Build the composited export payload (Markdown + annotated PNG). Returns
    // null if the screenshot/composite step fails (it needs a user gesture); the
    // Markdown is published to the dataset first for e2e/debugging either way.
    async function buildPayload(): Promise<ExportPayload | null> {
      const captured: Changelog = { ...changelog, capturedAt: Date.now() };
      document.documentElement.dataset['stmLastExport'] = changelogToMarkdown(captured);
      try {
        const screenshot = await requestScreenshot();
        const resolved = captured.annotations
          .map((annotation) => resolveGeometry(annotation, document))
          .filter((value) => value !== null);
        const image = await compositeAnnotations(screenshot, resolved, renderOptions);
        return await buildExportPayload(captured, image);
      } catch {
        return null;
      }
    }

    function setHandoff(next: Handoff | null): void {
      handoff = next;
      publish();
    }

    // Copy a cross-machine share token (SPEC §12): the annotation model for this
    // URL, gzipped — no screenshot. The recipient pastes it into their extension,
    // which opens the page and re-renders the marks against the live DOM.
    async function copyShareLink(): Promise<void> {
      const captured: Changelog = { ...changelog, capturedAt: Date.now() };
      const token = await encodeToken(buildBrief(captured));
      // Publish for e2e/debugging before the clipboard write (which needs a gesture).
      document.documentElement.dataset['stmLastShare'] = token;
      try {
        await navigator.clipboard.writeText(token);
        share = { kind: 'copied' };
      } catch {
        share = { kind: 'error', message: 'couldn’t copy the share link' };
      }
      publish();
    }

    async function exportToClipboard(): Promise<void> {
      const payload = await buildPayload();
      if (!payload) return;
      const sink = new ClipboardSink();
      if (await sink.isAvailable()) await sink.write(payload);
    }

    // Send the brief to the local `share-the-mark` daemon and surface the handoff token.
    async function sendToAgent(): Promise<void> {
      // The loopback host permission is opt-in; without it the background fetch
      // can't reach the daemon, so guide the user to enable it rather than build
      // a payload (a screenshot capture) we can't deliver.
      if (!(await sendMessage('daemonPermitted', undefined))) {
        setHandoff({
          kind: 'error',
          message: 'enable “Agent integration” in the extension Options to send to an agent',
          action: { label: 'Open setup', kind: 'open-options' },
        });
        return;
      }
      const health = await sendMessage('daemonHealth', undefined);
      if (!health.reachable) {
        setHandoff({
          kind: 'error',
          message:
            'no daemon yet — install the share-the-mark CLI, then run `share-the-mark serve`',
          action: { label: 'Open setup', kind: 'open-options' },
        });
        return;
      }
      // Version handshake (SPEC §11.4): warn on a floor mismatch instead of sending
      // to a daemon that can't read the brief — before paying for a screenshot.
      const compat = checkDaemonCompat({
        extensionVersion: browser.runtime.getManifest().version,
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
      const sink = new DaemonSink();
      try {
        const result = await sink.write(payload);
        if (result.ref) setHandoff({ kind: 'sent', command: `share-the-mark show ${result.ref}` });
      } catch {
        setHandoff({ kind: 'error', message: 'failed to send to the daemon' });
      }
    }

    onMessage('activateAnnotationMode', () => {
      ui.mount();
    });
    onMessage('deactivateAnnotationMode', () => {
      ui.remove();
    });
    onMessage('exportAnnotations', () => {
      void exportToClipboard();
    });

    // Signals (for e2e) that the message listeners above are registered.
    document.documentElement.dataset['stmReady'] = 'true';
  },
});
