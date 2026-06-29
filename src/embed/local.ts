/* eslint-disable unicorn/prefer-global-this -- this script runs injected in the
   page; `window` is the page global the idempotency guard lives on. */
import { mount, AGENT_CAPABILITIES, type StmHandle } from './mount';
import { capturePage } from './screenshot';
import { submitBrief } from './local-submit';

// Channel C (SPEC §13.6): the self-mounting IIFE the local daemon injects into the
// artifact it serves. Mirrors src/embed/standalone.ts (channel A), but instead of
// Playwright bindings it captures the page itself (the default html-to-image
// provider — a real DOM) and POSTs the brief same-origin to the daemon's `/brief`.
// Coverage-excluded (boot/glue, like standalone.ts); the testable POST logic lives
// in src/embed/local-submit.ts. Built by scripts/build-embed.mjs → local.global.js.

// The panel CSS, inlined at build time (esbuild `define`).
declare const __STM_PANEL_CSS__: string;

declare global {
  interface Window {
    /** The mounted embed handle — present once mounted, so a re-injected script no-ops. */
    __stm?: StmHandle;
  }
}

function boot(): void {
  // `<script>` injection can re-run per frame; only mount in the top frame, once.
  if (window.top !== window || window.__stm) return;
  void (async () => {
    const handle = await mount({
      styles: __STM_PANEL_CSS__,
      screenshot: capturePage,
      onExport: submitBrief,
      // The export sink *is* the agent submit here (POST /brief), so declare only the
      // export capability — one button labelled for what it does, no inert handoffs.
      capabilities: AGENT_CAPABILITIES,
    });
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- idempotency guard
    window.__stm = handle;
  })();
}

// Injected scripts can run before <body> exists; wait for the document if needed.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
