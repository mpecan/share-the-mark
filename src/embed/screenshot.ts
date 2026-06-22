import { toPng } from 'html-to-image';

// Default page-capture provider for the script-tag widget (SPEC §13.5). Channel B
// owns the page but has no `page.screenshot()` (that's Channel A) — so it captures
// the page itself via html-to-image. Captures the VISIBLE VIEWPORT as a PNG data
// URL at devicePixelRatio: `resolveGeometry` produces viewport-relative coordinates
// (getBoundingClientRect) and `compositeAnnotations` scales them by devicePixelRatio,
// matching the extension's `captureVisibleTab`, so the composited marks line up. Our
// own overlay host (`[data-stm-embed]`) is excluded; the marks are layered on
// afterward by the composite step (identical to Channel A). Real canvas/foreignObject
// glue, so coverage-excluded (like src/capture/composite-surface.ts) and exercised by
// the e2e. Overridable via `ShareTheMark.init({ screenshot })`.
export function capturePage(): Promise<string> {
  return toPng(document.documentElement, {
    // html-to-image calls the filter on every node (text nodes included, despite its
    // HTMLElement-typed signature), so narrow before touching dataset. Drop our
    // overlay/panel host so it isn't baked into the screenshot.
    filter: (node: Node) => !(node instanceof HTMLElement) || node.dataset['stmEmbed'] !== 'true',
    // Capture the viewport, offset by scroll, at device resolution.
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
    style: {
      transform: `translate(${String(-window.scrollX)}px, ${String(-window.scrollY)}px)`,
      transformOrigin: 'top left',
    },
  });
}
