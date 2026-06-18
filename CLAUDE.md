# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**share-the-mark** is a cross-browser (Chromium + Firefox) web extension for annotating live web pages and exporting a Markdown changelog plus an annotated screenshot to the clipboard. Built on [WXT](https://wxt.dev) with React.

**`SPEC.md` is the source of truth.** It is the full build brief — architecture, milestone plan, and a non-negotiable quality bar. Read it before implementing. This file is the short operating layer on top of it.

## Current state

**M0 (harness) and M1 (annotation core) are complete and green** on the `m1-annotation-core` branch, plus a **post-M1 redesign to content-anchored annotations** (SPEC §5.1/§5.3/§7 carry revision notes). All §8 gates pass: typecheck, zero-warning lint, ~100 tests (the per-glob `src/core/**` 100% bar and global thresholds both met), size budget, Chrome + Firefox builds/zips, and a Chromium e2e that draws a callout and asserts the exported Markdown carries the resolved `Element:` selector. pnpm + Node 22 pinned, lefthook hooks wired, CI runs the full pipeline.

**Annotations are content-anchored via W3C/Hypothesis text selectors.** Each stores a `target` (element selector — coarse scope + export reference) and a `TextAnchor`: a TextPosition (char offsets) + TextQuote (exact + prefix/suffix context) within that element, using `dom-anchor-text-position`/`dom-anchor-text-quote` (the latter bundles `diff-match-patch`). Resolution tries the position, verifies the quote, then fuzzy-searches — surviving reflow and node-replacing re-renders. `src/anchor` resolves a `ResolvedAnnotation` (absolute geometry) from the live DOM each render and on ResizeObserver/MutationObserver/scroll. Point tools anchor to the caret character (`caretPositionFromPoint`, overlay `pointer-events` dropped to hit page text); highlights use the selection range. The toolset is five drawing tools — **callout, text, arrow, highlight**, and **element** (a design-feedback comment anchored to a whole element box: hover to preview, click to select; no text anchor, via `elementFromPoint`) — plus a **select** tool that switches to edit mode.

What's implemented (all behind `src/`):
- `core/selector` — `computeSelector`/`resolveSelector` (fast-check round-trip), `core/model` — anchored annotation union + callout-numbering reducer, `core/markdown` — Turndown wrapper, `core/export` — payload + changelog Markdown format.
- `anchor` — `describeRange`/`anchorRange` (text selectors via the dom-anchor libs) and `resolveGeometry` (TextAnchor → absolute geometry), shared by overlay and compositor.
- `overlay` — imperative, **SVG-only** pointer state machine, split into `overlay.ts` (the controller: DOM mount, event state machine, creation, render orchestration), `svg.ts` (`SvgRenderer`: geometry → SVG), `hit-test.ts` (`PageHitTester`: pointer-events-dropping caret/element hit-testing), and `edit.ts` (edit model + `AnchorEditor`: drag → updated annotation, incl. re-anchoring). Re-renders on scroll/resize + observers; caret hit-tests page text for point tools and captures the selection on `mouseup` for highlights. Existing marks are editable **in the `select` tool (edit mode)**; handles render only then. pointerdown on a mark (`data-stm-id`) starts a drag (callout/text move; arrow endpoints/whole-line via handles; highlight start/end handles re-anchor the text range). On drop, moved callouts/text/arrow-heads **re-anchor to the text under the drop point** (caret hit-test → new `target`/`anchor`/offsets; falls back to the original anchor off-text); the drag preview stays a cheap offset delta and re-anchor runs once on `pointerup`. Double-clicking a text mark retypes it — all via an `onUpdate` callback and the reducer's `update` action. Drawing tools only create; the select tool only edits.
- `capture` — `render` (canvas drawing of `ResolvedAnnotation` behind a `DrawContext`), `composite` (DI'd canvas/image plumbing; real glue in `composite-surface.ts`, excluded from coverage), `ClipboardSink`, screenshot round-trip.
- `messaging` (typed `ProtocolMap`), `storage` (settings + per-tab/URL changelog, keyed `v2:` after the anchoring change), `panel` (React changelog panel behind an external store + error boundary; tool palette). Entrypoints wire it together: `content.ts` mounts overlay+panel into a closed shadow root on activation and provides `resolveTarget`; popup toggles mode; options page persists settings.

**M2 is in progress** (agent integration). M1 is merged to `main`; M2 work is on `m2-cli-agent`. The agent path is a `DaemonSink` (behind `ExportSink`) + a cross-platform Rust **`stm` CLI** under `cli/`: the extension's background SW POSTs briefs to a localhost daemon (`stm serve`, `127.0.0.1:8787`, one loopback `host_permission`), which persists them and exposes them to an agent via CLI commands (`stm pending`/`show`) + a bundled Claude Code skill; the panel surfaces a handoff token (`stm show <id>`). `stm request <url>` is the agent-initiated flow (open page → block on a same-origin brief → wake the agent). Daemon lifecycle: explicit `stm serve`/`start` persist; auto-started daemons get an idle timeout (default 30 min) and self-exit. The shadow-root UI isolates its keyboard events from the host page (`isolateKeyboard`). No MCP. Still deferred: FileSystemSink, native side panel, Firefox e2e.

Decisions worth knowing before you touch things:
- ESLint plugins ship loose flat-config typings: `react-hooks`/`react-refresh` are wired manually (cast to `ESLint.Plugin`), the import resolver is `eslint-import-resolver-typescript` via `import-x/resolver-next`. A `tests/**` override relaxes a few unicorn rules (beforeEach assignment, fixture nesting, literal whitespace).
- size-limit reads `size-limit.config.ts` only via `--config` (run `pnpm size`); `running: false` keeps it a pure gzip-byte gate with no headless Chrome.
- `lib.dom` types `Element.textContent`, `Document.body`, and `NodeListOf.item()` as non-null — don't add guards the linter will flag as unnecessary.
- The overlay/panel live in a **closed** shadow root, so e2e can't query into it: activation/export are driven via the `getTabId`/`exportAnnotations` messages from the service worker, and the content script publishes the exported Markdown to `document.documentElement.dataset.stmLastExport` for assertions. `captureVisibleTab` + clipboard write need a user gesture, so they're best-effort there and unit-tested instead.

## Commands

```bash
pnpm dev               # Chrome dev
pnpm dev:firefox       # Firefox dev
pnpm build             # build Chrome (also build:firefox)
pnpm zip / zip:firefox # package for store submission
pnpm typecheck         # tsc --noEmit — the typecheck gate
pnpm lint              # eslint --max-warnings=0 (zero warnings required)
pnpm test              # vitest with coverage thresholds
pnpm e2e               # Playwright against built unpacked extension
```

Run a single test: `pnpm vitest run path/to/file.test.ts` (or `-t "test name"`).

## Definition of done (SPEC §8 — enforced every commit)

A change is done only when **all** pass: `pnpm typecheck`, `pnpm lint` (**zero warnings**), `pnpm test` (coverage thresholds met), `pnpm build` (both browsers), plus e2e green for M1 feature work.

Coverage thresholds are CI-enforced and stricter for the pure core:
- Global: lines/statements/functions ≥ 90%, branches ≥ 85%.
- `src/core/**`: ≥ 100% lines/functions/statements, ≥ 95% branches.

TS strictness beyond `strict`: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, and others (§8.1). ESLint is type-aware `strictTypeChecked` + `stylisticTypeChecked`; `no-floating-promises` / `no-misused-promises` are non-negotiable given the async messaging surface. Commits are Conventional Commits (commitlint).

## Architecture invariants (don't violate these)

- **Cross-browser via WXT's unified `browser.*` global — never reference `chrome.*`.** One MV3 source for all targets.
- **`src/core/**` is pure and browser-free** (selector engine, annotation model, markdown, export payload builder). No extension APIs there — it's the ~100%-covered, unit-testable bulk of the logic. Keep side effects and `browser.*` out.
- **The drawing overlay (`src/overlay`) is plain imperative TypeScript, NOT React.** It's a pointer-event state machine (`idle | drawing | editing | placing-text`) rendering **SVG only** (callout, text, arrow, highlight), resolved from the live DOM each render, and must stay at 60fps. React is only for static-ish UI (popup, options, changelog panel).
- **UI mounts into a closed shadow root** (WXT `createShadowRootUi`) so host-page CSS can't bleed in or out. The changelog panel is in-page (shadow root), not a native side panel — that keeps M1 identical across browsers (`sidePanel` is deferred M2).
- **Export is behind the `ExportSink` interface** (§5.4). M1 ships exactly one sink: `ClipboardSink`, which writes a single `ClipboardItem` (`text/plain` Markdown + `image/png`). It **must run in the content-script context under a user gesture** — service workers cannot touch `navigator.clipboard`. M2 adds sinks without touching capture/drawing/model.
- **`captureVisibleTab` is the only message that must round-trip to the background service worker** (`tabs.captureVisibleTab` is unavailable in content scripts). Treat the MV3 service worker as ephemeral: hold no in-memory state across invocations; rehydrate from storage.
- **Least-privilege permissions (M1):** `activeTab`, `scripting`, `storage`. No `host_permissions`. Add `clipboardWrite` only if a target browser rejects gesture-based image writes, and document the reason inline in `wxt.config.ts`.
- Callout numbering is a **pure reducer in `src/core/model`**: 1-based, contiguous, renumbers on delete. The selector engine round-trip (`resolveSelector(computeSelector(node)) === node`) and uniqueness are verified with fast-check property tests.

## Layout

WXT convention: `entrypoints/` (background, content, popup, options) is auto-discovered; `srcDir: '.'`. Application logic lives under `src/` (`core/`, `overlay/`, `panel/`, `messaging/`, `storage/`, `capture/`). Tests in `tests/{unit,integration,e2e,fixtures}`. See SPEC §4 for the full tree.

The **`cli/`** directory is a separate, self-contained Rust crate (binary `stm`, the M2 daemon) — its own `cargo` build/test/clippy/fmt, gated in CI on a 3-OS matrix; not part of the pnpm/TS toolchain (`cli/target` is gitignored). The bundled agent skill lives at `cli/skill/share-the-mark/SKILL.md` (embedded via `include_str!`).
