import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { onMessage, sendMessage } from '@/src/messaging';
import { Overlay } from '@/src/overlay';
import {
  PanelApp,
  isolateKeyboard,
  type Handoff,
  type PanelSnapshot,
  type PanelStore,
} from '@/src/panel';
import {
  changelogReducer,
  type Changelog,
  type ChangelogAction,
  type ToolKind,
} from '@/src/core/model';
import { buildExportPayload, changelogToMarkdown, type ExportPayload } from '@/src/core/export';
import { getSettings, loadChangelog, saveChangelog } from '@/src/storage';
import { resolveGeometry } from '@/src/anchor';
import {
  ClipboardSink,
  DaemonSink,
  compositeAnnotations,
  requestScreenshot,
  type RenderOptions,
} from '@/src/capture';
import '@/src/panel/panel.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
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

    // External store the panel subscribes to; React owns its own re-renders.
    const buildSnapshot = (): PanelSnapshot => ({
      annotations: changelog.annotations,
      activeTool,
      handoff,
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
        });
        return;
      }
      const payload = await buildPayload();
      if (!payload) return;
      const sink = new DaemonSink();
      if (!(await sink.isAvailable())) {
        setHandoff({ kind: 'error', message: 'daemon not reachable — run `share-the-mark serve`' });
        return;
      }
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
