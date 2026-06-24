import type { ToolKind } from '@/src/core/model';

// The plain `Settings` shape and defaults, split out from `settings.ts` so they
// can be imported without pulling in `wxt/utils/storage` (which `settings.ts`
// touches at module load). The extension uses the WXT-backed store in
// `settings.ts`; the browser-free embed (`src/embed`) imports `DEFAULT_SETTINGS`
// from here directly. Keeping one source of truth avoids drift — the core renders
// `renderOptions` straight from `Settings`.

/** UI appearance: `auto` follows the OS (`prefers-color-scheme`); `light`/`dark`
 * force the panel, popup, and options pages to that theme regardless of the OS. */
export type ThemeMode = 'auto' | 'light' | 'dark';

/**
 * How the exported screenshot is captured (extension only):
 * - `viewport` — `tabs.captureVisibleTab`: a real, pixel-accurate raster of the
 *   visible viewport. High fidelity, but only what's on screen.
 * - `fullPage` — re-renders the whole scrollable document via html-to-image. Gives
 *   the agent the full page context, but is a DOM reconstruction: cross-origin
 *   images/iframes, `<canvas>`/`<video>`, and some CSS may be missing or off, and a
 *   strict page CSP can block it. The embed channels always use the full-page path.
 */
export type CaptureMode = 'viewport' | 'fullPage';

export interface Settings {
  defaultTool: ToolKind;
  strokeColor: string;
  strokeWidth: number;
  highlightColor: string;
  /** Extra selectors stripped during Markdown extraction. */
  markdownStrip: string[];
  /** Light/dark/auto appearance of the extension's own UI. */
  theme: ThemeMode;
  /** Viewport (high-fidelity) vs full-page (full context, lower fidelity) capture. */
  captureMode: CaptureMode;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultTool: 'callout',
  strokeColor: '#e11d48',
  strokeWidth: 3,
  highlightColor: '#fde047',
  markdownStrip: [],
  theme: 'auto',
  // Default to the high-fidelity viewport capture; full-page is opt-in (it trades
  // fidelity for whole-page context).
  captureMode: 'viewport',
};
