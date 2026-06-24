import { toPng } from 'html-to-image';
import type { CapturedScreenshot } from '@/src/capture/composite';

// Default page-capture provider for the script-tag widget (SPEC §13.5). Channel B
// owns the page but has no `page.screenshot()` (that's Channel A) — so it captures
// the page itself via html-to-image. Captures the FULL SCROLLABLE DOCUMENT as a PNG
// data URL at devicePixelRatio: `resolveGeometry` produces viewport-relative
// coordinates (getBoundingClientRect) and `compositeAnnotations` shifts them by the
// reported `offset` (the document origin = scroll) and scales by devicePixelRatio, so
// marks line up anywhere on the page — including below the fold. Our own overlay host
// (`[data-stm-embed]`) is excluded; the marks are layered on afterward by the composite
// step (identical to Channel A). Real canvas/foreignObject glue, so coverage-excluded
// (like src/capture/composite-surface.ts) and exercised by the e2e. Overridable via
// `ShareTheMark.init({ screenshot })`.
export async function capturePage(): Promise<CapturedScreenshot> {
  const root = document.documentElement;
  const dataUrl = await toPng(root, {
    // html-to-image calls the filter on every node (text nodes included, despite its
    // HTMLElement-typed signature), so narrow before touching dataset. Drop our
    // overlay/panel host so it isn't baked into the screenshot.
    filter: (node: Node) => !(node instanceof HTMLElement) || node.dataset['stmEmbed'] !== 'true',
    // Capture the whole document (not just the viewport) at device resolution; the
    // image's top-left is the document origin, so the composite offset is the scroll.
    width: root.scrollWidth,
    height: root.scrollHeight,
    pixelRatio: window.devicePixelRatio || 1,
  });
  return { dataUrl, offset: { x: window.scrollX, y: window.scrollY } };
}
