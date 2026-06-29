// What a host/channel can actually do (SPEC §13.6). The changelog footer renders
// one action per capability the host declares — no per-button visibility flags.
// Each channel states its own set: the extension declares the full set
// (DEFAULT_CAPABILITIES), while a single-delivery channel (local-serve, where the
// export sink *is* the agent submit) declares only `exportLabel` so it surfaces one
// correctly-labelled button. Kept out of PanelApp.tsx so the runtime default can be
// exported without tripping react-refresh's component-only-export rule.

export interface PanelCapabilities {
  /** Label for the always-present export/submit button. */
  exportLabel: string;
  /** The host can hand off to the local `share-the-mark` daemon ("Send to agent"). */
  agentHandoff: boolean;
  /** The host supports cross-machine share links (SPEC §12). */
  shareLink: boolean;
}

/** The extension's full footer: clipboard export + agent handoff + share link.
 *  Used whenever a channel omits `capabilities`. */
export const DEFAULT_CAPABILITIES: PanelCapabilities = {
  exportLabel: 'Copy to clipboard',
  agentHandoff: true,
  shareLink: true,
};
