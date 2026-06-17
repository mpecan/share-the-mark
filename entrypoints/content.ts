import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { onMessage, sendMessage } from '@/src/messaging';
import { Overlay } from '@/src/overlay';
import { ChangelogPanel } from '@/src/panel';
import { computeSelector } from '@/src/core/selector';
import {
  changelogReducer,
  type Changelog,
  type ChangelogAction,
  type Point,
  type ToolKind,
} from '@/src/core/model';
import { buildExportPayload, changelogToMarkdown } from '@/src/core/export';
import { getSettings, loadChangelog, saveChangelog } from '@/src/storage';
import {
  ClipboardSink,
  compositeAnnotations,
  requestScreenshot,
  type RenderOptions,
} from '@/src/capture';
import type { TargetRef } from '@/src/core/selector';
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

    // Filled once the shadow host exists; read lazily during hit-testing.
    const refs: { shadowHost?: Element } = {};

    function targetAt(point: Point): TargetRef | undefined {
      const element = document
        .elementsFromPoint(point.x, point.y)
        .find((el) => el !== refs.shadowHost && refs.shadowHost?.contains(el) !== true);
      return element ? computeSelector(element) : undefined;
    }

    const ui = await createShadowRootUi(ctx, {
      name: 'share-the-mark',
      position: 'overlay',
      anchor: 'body',
      append: 'last',
      mode: 'closed',
      onMount: (container) => {
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
          resolveTarget: targetAt,
        });

        function renderPanel(): void {
          panelRoot.render(
            createElement(ChangelogPanel, {
              annotations: changelog.annotations,
              activeTool,
              onSelectTool: (tool) => {
                activeTool = tool;
                overlay.setTool(tool);
                renderPanel();
              },
              onEditNote: (id, note) => {
                dispatch({ type: 'updateNote', id, note });
              },
              onDelete: (id) => {
                dispatch({ type: 'remove', id });
              },
              onExport: () => {
                void exportChangelog();
              },
            }),
          );
        }

        function dispatch(action: ChangelogAction): void {
          changelog = changelogReducer(changelog, action);
          overlay.setAnnotations(changelog.annotations);
          void saveChangelog(tabId, changelog);
          renderPanel();
        }

        overlay.setAnnotations(changelog.annotations);
        renderPanel();
        return { overlay, panelRoot };
      },
      onRemove: (mounted) => {
        mounted?.overlay.destroy();
        mounted?.panelRoot.unmount();
      },
    });

    refs.shadowHost = ui.shadowHost;

    async function exportChangelog(): Promise<void> {
      const captured: Changelog = { ...changelog, capturedAt: Date.now() };
      // Publish the exact Markdown (identical to the clipboard text/plain) first,
      // for e2e and debugging.
      document.documentElement.dataset['stmLastExport'] = changelogToMarkdown(captured);
      try {
        // captureVisibleTab needs activeTab (granted by a user gesture on the
        // action) and the clipboard write needs a user gesture (the panel
        // button provides one). Best-effort: the Markdown is already published.
        const screenshot = await requestScreenshot();
        const image = await compositeAnnotations(screenshot, captured.annotations, renderOptions);
        const payload = await buildExportPayload(captured, image);
        const sink = new ClipboardSink();
        if (await sink.isAvailable()) await sink.write(payload);
      } catch {
        /* screenshot/clipboard require a user gesture; Markdown is still published */
      }
    }

    onMessage('activateAnnotationMode', () => {
      ui.mount();
    });
    onMessage('deactivateAnnotationMode', () => {
      ui.remove();
    });
    onMessage('exportAnnotations', () => {
      void exportChangelog();
    });

    // Signals (for e2e) that the message listeners above are registered.
    document.documentElement.dataset['stmReady'] = 'true';
  },
});
