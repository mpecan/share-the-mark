# share-the-mark— Build Specification

A cross-browser web-extension for annotating live web pages and exporting a
structured Markdown changelog plus an annotated screenshot. Open-source,
TypeScript-first, built on [WXT](https://wxt.dev).

This document is the build brief. It is written to be handed to Claude Code as
the source of truth. Implement it milestone by milestone; do not skip the
quality gates in §8 — they are part of the definition of done for every commit.

---

## 1. Overview & goals

**What it does (Milestone 1):** the user activates annotation mode on any web
page, draws annotations directly over the live DOM (seven tools), each
annotation anchored to a real element via a robust CSS selector. A live
changelog panel tracks every marker. On export, the extension composites the
annotations onto a screenshot and produces a Markdown changelog, then writes
both to the clipboard as a single `ClipboardItem` ready to paste into any AI
assistant.

**Explicit non-goals for M1** (deferred to M2, see §10): writing to the local
filesystem, native-messaging hosts, localhost daemons, or any direct agent
dispatch. M1 ends at the clipboard. The export layer is nonetheless designed
behind an `ExportSink` interface (§5.4) so M2 is purely additive.

**Design principles**
- One codebase, all Chromium browsers + Firefox. No per-browser source forks.
- The hot path (drawing) is imperative and framework-free. React is used only
  for static-ish UI (popup, options, changelog panel).
- Pure, side-effect-free core modules (selector engine, annotation model,
  Markdown conversion) so the bulk of logic is unit-testable without a browser.
- Strict types and strict lint from commit one. Quality is a gate, not a
  cleanup pass.

---

## 2. Scope boundary

| Capability | Milestone |
|---|---|
| Scaffold, configs, CI, hooks, green pipeline | M0 |
| Annotation overlay + 7 tools | M1 |
| CSS selector engine | M1 |
| In-page changelog panel | M1 |
| Screenshot capture + annotation compositing | M1 |
| DOM → Markdown extraction | M1 |
| Clipboard export (`ExportSink` impl #1) | M1 |
| Persisted annotations per tab/URL | M1 |
| Settings/options page | M1 |
| Filesystem save / native host / localhost daemon | **M2 (deferred)** |
| Agent dispatch / folder-watch workflow | **M2 (deferred)** |
| Native browser side panel (Chrome `sidePanel`) | **M2 (deferred)** |

The `ExportSink` interface ships in M1 with the clipboard implementation. M2
adds further implementations (`FileSystemSink`, `NativeHostSink`,
`LocalDaemonSink`) without touching capture, drawing, or model code.

---

## 3. Tech stack

Pin Node via `mise` (`.tool-versions`) or `.nvmrc`; target Node 22 LTS. Package
manager: **pnpm**.

**Core**
- `wxt` — framework, build, manifest generation, per-browser packaging
- `@wxt-dev/module-react` — React integration for WXT entrypoints
- `react`, `react-dom`
- `typescript` (5.x)
- `turndown` (+ `@types/turndown`) — HTML→Markdown
- `@webext-core/messaging` — typed message bus across contexts

**Lint / format**
- `eslint`, `@eslint/js`, `typescript-eslint` (flat config, type-aware)
- `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- `eslint-plugin-unicorn`
- `eslint-plugin-import-x`
- `eslint-config-prettier`, `prettier`

**Test**
- `vitest`, `@vitest/coverage-v8`
- `happy-dom` (unit/integration DOM)
- `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`
- WXT testing utilities (`WxtVitest` plugin, `wxt/testing` `fakeBrowser`)
- `@playwright/test` — e2e against the built unpacked extension (Chromium)
- `fast-check` — property-based tests for the selector engine

**Repo hygiene**
- `lefthook` — git hooks (fast, single binary)
- `@commitlint/cli`, `@commitlint/config-conventional`
- `size-limit`, `@size-limit/preset-app` — bundle budget enforcement

**Framework choice note:** React is chosen for ecosystem/agent familiarity and
the side-panel UI. If the popup/options/panel bundle exceeds budget, swap to
Preact via `@wxt-dev/module-react`'s Preact alias — the component code is
unaffected. The drawing overlay is **not** React (see §5.1).

---

## 4. Repository structure

```
share-the-mark/
├─ .github/workflows/ci.yml
├─ .tool-versions                 # mise: node 22
├─ eslint.config.ts
├─ prettier.config.mjs
├─ lefthook.yml
├─ commitlint.config.mjs
├─ vitest.config.ts
├─ playwright.config.ts
├─ size-limit.config.ts
├─ tsconfig.json                  # extends .wxt/tsconfig
├─ wxt.config.ts
├─ package.json
├─ SPEC.md                        # this file
├─ CLAUDE.md                      # agent operating notes (see §11)
├─ entrypoints/
│  ├─ background.ts               # screenshot capture, coordination
│  ├─ content.ts                  # mounts overlay in shadow root
│  ├─ popup/                      # React: activate/deactivate, open options
│  └─ options/                    # React: settings
├─ src/
│  ├─ core/                       # pure, browser-free, ~100% covered
│  │  ├─ selector/                # computeSelector / resolveSelector
│  │  ├─ model/                   # annotation types, changelog, numbering
│  │  ├─ markdown/                # dom-to-markdown
│  │  └─ export/                  # ExportSink + payload builder
│  ├─ overlay/                    # imperative canvas + svg drawing layer
│  ├─ panel/                      # React changelog panel (rendered in shadow root)
│  ├─ messaging/                  # typed protocol (ProtocolMap)
│  ├─ storage/                    # typed storage.local wrappers
│  └─ capture/                    # screenshot compositing
├─ tests/
│  ├─ unit/                       # mirrors src/core
│  ├─ integration/                # messaging + storage w/ fakeBrowser
│  ├─ e2e/                        # playwright specs
│  └─ fixtures/                   # static HTML pages to annotate
└─ public/                        # icons, static assets
```

---

## 5. Architecture

### 5.1 Drawing overlay (`src/overlay`)

> **Revision (post-M1):** annotations are now **content-anchored** rather than
> positioned in viewport coordinates, and the toolset is pared to four tools
> (callout, text, arrow, **text-selection** highlight). The overlay is **SVG
> only**. Anchoring follows the **W3C Web Annotation model** (Hypothesis-style):
> each annotation stores a **TextPosition** (character offsets) and a
> **TextQuote** (exact text + prefix/suffix context) within its target element,
> via `dom-anchor-text-position` / `dom-anchor-text-quote` (the latter brings
> `diff-match-patch`). On resolve we try the position selector, verify it against
> the stored quote, then fall back to a fuzzy quote search — so marks survive
> reflow and node-replacing re-renders, not just resize. Positions are recomputed
> each render (`src/anchor`) and on ResizeObserver + MutationObserver + scroll.
> This supersedes the original raster/7-tool design described below in §5.3/§7.

Mounted by the content script into a **closed shadow root** (via WXT
`createShadowRootUi`) so host-page CSS cannot bleed in and the extension UI
cannot leak out. A single SVG layer renders every tool; there is no raster
canvas in the live overlay (compositing for export still rasterises onto the
screenshot, §5.4).

The overlay is plain TypeScript with an explicit state machine
(`idle | drawing | editing | placing-text`). No React in this path: drawing is
pointer-event-driven and must stay at 60fps. The overlay emits a creation event
(`onCreate`) consumed by the content script, which reduces the changelog and
feeds the committed set back for rendering.

Pointer handling supports mouse and pen/touch (`PointerEvent`). The **highlight**
tool drops the overlay's `pointer-events` so native text selection works on the
page, and captures the selection `Range` on `mouseup`.

Existing marks are **editable** in the dedicated **select tool** (edit mode), so
editing never collides with drawing: drawing tools only create, the select tool
only edits. Control-point handles render **only in the select tool** (so their
presence is the affordance), and the cursor changes over marks/handles. In edit
mode, pressing on a mark drags it — callout/text move, arrows expose endpoint
handles (and the line moves the whole arrow), and highlights expose start/end
handles — and double-clicking a text mark retypes it. **On drop, a moved mark
re-anchors to the text under where it landed**: the callout/text point or the
arrow head is caret-hit-tested and `target`/`anchor`/offsets are recomputed
against the new character, so the mark stays where dropped *and* tracks the new
text on reflow; it falls back to keeping the original anchor when the drop point
isn't over text. The drag preview uses the cheap offset delta (visually
identical) — the re-anchor runs once on `pointerup`; highlights re-anchor their
range continuously while a handle is dragged. Edits flow out via `onUpdate` and
the reducer's `update` action.

### 5.2 Selector engine (`src/core/selector`) — the differentiator

Pure functions, no extension APIs.

```ts
interface TargetRef {
  selector: string;        // primary, verified-unique selector
  fallbacks: string[];     // ordered alternative strategies
  tag: string;             // lowercased tagName, for sanity checks
  rect: { x: number; y: number; width: number; height: number };
}

function computeSelector(el: Element, root?: Document): TargetRef;
function resolveSelector(ref: TargetRef, root?: Document): Element | null;
```

Strategy order for the primary selector:
1. `#id` when the id is stable (not auto-generated — reject ids matching
   framework hash patterns, e.g. `/^:r[0-9a-z]+:$/i`, long hex/uuid runs).
2. A stable test attribute: `[data-testid]`, `[data-test]`, `[data-qa]`.
3. A unique, semantically meaningful attribute (`name`, `aria-label`,
   `role` + text) when it yields a single match.
4. Structural path using `:nth-of-type()` from the nearest stable ancestor.

Every candidate is verified to match exactly one element under `root` before
being accepted as primary; the rest populate `fallbacks`. `resolveSelector`
tries `selector`, then each fallback, returning the first single match.

Property-based tests (fast-check): generate random DOM trees, pick a node,
assert `resolveSelector(computeSelector(node)) === node` (round-trip), and
assert uniqueness of the primary selector.

### 5.3 Annotation model (`src/core/model`)

**Revised, content-anchored model.** Every annotation carries a `target`
(the element selector — a coarse scope + the export reference) and a `TextAnchor`
(TextPosition + TextQuote within that element). Markers/arrows/text resolve to a
caret point; highlights resolve to a text range; the arrow stores its tail as an
offset from the anchored head. Absolute positions are derived at render time
(`src/anchor`).

```ts
type ToolKind = 'callout' | 'text' | 'arrow' | 'highlight';

interface TextAnchor {
  start: number; end: number;          // TextPositionSelector
  exact: string; prefix: string; suffix: string; // TextQuoteSelector
}
interface AnchoredPoint { dx: number; dy: number } // arrow tail offset

interface AnnotationBase {
  id: string;              // crypto.randomUUID()
  kind: ToolKind;
  createdAt: number;
  note?: string;           // the label shown in the changelog
  target: TargetRef;       // coarse anchor + export reference
  anchor: TextAnchor;      // precise content anchor within target
}

interface CalloutAnnotation extends AnnotationBase {
  kind: 'callout';
  index: number;           // auto-numbered, 1-based, gap-free
}
// text(content), arrow(tail: AnchoredPoint), highlight — all share target + anchor

type Annotation = CalloutAnnotation | /* …union of all kinds */;

interface Changelog {
  id: string;
  url: string;
  title: string;
  capturedAt: number;
  annotations: Annotation[];
}
```

Numbering rules: callout indices are 1-based and contiguous; deleting a callout
renumbers the rest. Numbering logic lives here as a pure reducer and is unit
tested exhaustively (insert, delete-middle, reorder).

### 5.4 Export (`src/core/export`)

```ts
interface ExportPayload {
  markdown: string;        // the changelog as Markdown (see format below)
  image: Blob;             // PNG: screenshot with annotations composited
  meta: { url: string; title: string; capturedAt: number };
}

interface ExportSink {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  write(payload: ExportPayload): Promise<void>;
}

function buildExportPayload(
  changelog: Changelog,
  screenshot: Blob,
): Promise<ExportPayload>;
```

M1 ships exactly one sink: `ClipboardSink` (writes a `ClipboardItem` carrying
`text/plain` Markdown + `image/png`). It must run in the **content-script
context** under a user gesture — service workers cannot touch
`navigator.clipboard`.

Markdown changelog format (stable, agent-friendly):

```markdown
# Change brief — {title}
Source: {url}
Captured: {ISO-8601}

1. {note}
   Element: `{target.selector}`
2. {note}
   Element: `{target.selector}`
```

Annotations without a target omit the `Element:` line. Order follows callout
index, then creation time for non-callout annotations.

### 5.5 DOM → Markdown (`src/core/markdown`)

```ts
function elementToMarkdown(el: Element, opts?: MarkdownOptions): string;
function documentToMarkdown(doc: Document, opts?: MarkdownOptions): string;
```

Wraps Turndown with: ATX headings, fenced code blocks, preserved tables, and a
pre-pass that strips nav/aside/footer/script/style and obvious chrome. Pure and
unit-tested against fixture HTML. (Used for "extract this element/page as
context" — the extraction half of the tool, independent of annotations.)

### 5.6 Messaging (`src/messaging`)

Typed protocol via `@webext-core/messaging`:

```ts
interface ProtocolMap {
  activateAnnotationMode(): void;
  deactivateAnnotationMode(): void;
  captureVisibleTab(): string;     // background → returns data URL
}
```

`captureVisibleTab` is the only message that must round-trip to the background
(service worker) in M1, because `tabs.captureVisibleTab` is unavailable in
content scripts.

### 5.7 Storage (`src/storage`)

Typed wrappers over WXT's `storage` (`local:` area). Persist (a) user settings
and (b) the current changelog keyed by tab+URL so a reload doesn't lose work.
No sync storage in M1.

### 5.8 Entrypoints

- **`background.ts`** — handles `captureVisibleTab`; otherwise minimal. Assume
  an ephemeral MV3 service worker (Chrome): hold no in-memory state across
  invocations; rehydrate from storage.
- **`content.ts`** — injects overlay + panel into a shadow root on demand
  (activated from the popup). Matches `<all_urls>`, `run_at: document_idle`.
- **`popup/`** — React. Activate/deactivate annotation mode, open options.
- **`options/`** — React. Settings (default tool, stroke defaults, Markdown
  extraction prefs).

---

## 6. Cross-browser strategy

- **Always** use WXT's unified `browser.*` global; never reference `chrome.*`.
- Single MV3 build for Chromium targets and Firefox. WXT resolves the
  background service-worker vs event-page difference and namespace differences.
- **Permissions (M1, least-privilege):** `activeTab`, `scripting`, `storage`.
  No `host_permissions`; `tabs.captureVisibleTab` works under `activeTab` +
  user gesture. Add `clipboardWrite` only if a target browser rejects
  gesture-based image writes (document the reason inline in `wxt.config.ts` if
  added).
- **Changelog UI is in-page** (shadow root), not a native side panel, precisely
  so M1 stays identical across browsers. Native `sidePanel` (Chrome) /
  `sidebar_action` (Firefox) is an M2 enhancement.
- Build matrix: `wxt build` (Chrome) and `wxt build -b firefox`; `wxt zip` for
  both in CI.

---

## 7. Annotation toolset

> **Revision (post-M1):** the toolset is pared to five content-anchored drawing
> tools (the original seven, with their raster/shape tools, are superseded), plus
> a **select** tool that switches to edit mode (move/resize existing marks).
> Every tool anchors to an element via a `TargetRef`.

1. **Callout** — auto-numbered marker (dot) anchored at a point on an element.
2. **Text** — a text label anchored at a point on an element.
3. **Arrow** — straight arrow whose endpoints are offsets from an element's box.
4. **Highlight** — a real **text-selection** highlight: select text on the page
   and the highlight is anchored to that character range and rendered over its
   live client rects.
5. **Element** — a design-feedback comment on a whole element: hover to preview
   the element under the cursor, click to select it, and the comment is the
   note. Anchored to the element box (its `TargetRef`), no text anchor.
6. **Select** — edit mode (not a drawing tool): move marks, drag arrow/highlight
   control-point handles, and double-click a text mark to retype it.

Plus screenshot capture with all annotations composited. Every annotation
appears in the live changelog the instant it's created; editing its note
updates the changelog in place; deleting it renumbers callouts. Because
annotations are content-anchored, they track the page across scroll/resize.

---

## 8. Quality bar (definition of done — enforced every commit)

A change is done only when: `pnpm typecheck`, `pnpm lint` (**zero warnings**),
`pnpm test` (coverage thresholds met), and `pnpm build` (both browsers) all
pass, plus e2e green for M1 feature work.

### 8.1 TypeScript (`tsconfig.json`, extends `.wxt/tsconfig`)
Enable, on top of `strict`:
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`,
`verbatimModuleSyntax`, `isolatedModules`. `tsc --noEmit` is the typecheck gate.

### 8.2 ESLint (`eslint.config.ts`, flat, type-aware)
Compose: `@eslint/js` recommended → `typescript-eslint`
`strictTypeChecked` + `stylisticTypeChecked` (with
`parserOptions.projectService: true`) → `react-hooks` recommended →
`react-refresh` → `unicorn` recommended (tune off only with a written
justification per rule) → `import-x` → `eslint-config-prettier` last. Lint
script runs with `--max-warnings=0`. Type-aware rules `no-floating-promises`
and `no-misused-promises` are non-negotiable given the async messaging surface.

### 8.3 Formatting
Prettier; `eslint-config-prettier` disables conflicting stylistic rules so
ESLint never fights the formatter.

### 8.4 Testing & coverage (`vitest.config.ts`)
- Environment `happy-dom`, globals on, `setupFiles` wiring `fakeBrowser` +
  `@testing-library/jest-dom`; include `WxtVitest()` plugin.
- **Coverage (v8) thresholds, CI-enforced:**
  global lines/statements/functions ≥ **90%**, branches ≥ **85%**;
  `src/core/**` ≥ **100%** lines/functions/statements, ≥ **95%** branches.
- Test layers:
    - **unit** — everything in `src/core` (pure). Selector engine also gets
      fast-check property tests.
    - **integration** — messaging + storage against `fakeBrowser`.
    - **e2e** — Playwright loads the built unpacked extension in a Chromium
      persistent context (`--disable-extensions-except`, `--load-extension`),
      opens a fixture page, activates annotation mode, draws a callout, exports,
      and asserts the clipboard Markdown contains the expected selector line.
      (Firefox e2e via `web-ext` is M2; Chromium e2e is the M1 gate.)

### 8.5 CI (`.github/workflows/ci.yml`)
On push + PR: setup pnpm + Node 22 → install (frozen lockfile) →
`wxt prepare` → typecheck → lint → test (coverage) → `size-limit` →
build Chrome + Firefox → install Playwright browsers → e2e →
upload both `.output` zips as artifacts. Pipeline must be green to merge.

### 8.6 Git hooks (`lefthook.yml`) & commits
- `pre-commit`: ESLint (fix) + Prettier on staged files, then `tsc --noEmit`.
- `commit-msg`: commitlint (Conventional Commits).
- `pre-push`: `pnpm test` (unit + integration; e2e left to CI for speed).

### 8.7 Bundle budget
`size-limit` caps the popup/options/panel bundle (start at 150 kB gzip; adjust
with justification). Exceeding the budget fails CI.

---

## 9. Reference configuration intent

Claude Code should generate these files to satisfy §8; treat the following as
the contract, not copy-paste targets:

- `wxt.config.ts` — `modules: ['@wxt-dev/module-react']`; manifest name,
  description, M1 permissions (§6); `srcDir: '.'`; entrypoints auto-discovered.
- `eslint.config.ts` — composition from §8.2 using `tseslint.config(...)`.
- `vitest.config.ts` — `WxtVitest()`, happy-dom, coverage thresholds from §8.4.
- `playwright.config.ts` — Chromium project loading `.output/chrome-mv3`.
- `lefthook.yml`, `commitlint.config.mjs`, `size-limit.config.ts`,
  `prettier.config.mjs` per §8.

`package.json` scripts (names are part of the contract — CI and hooks call
them): `dev`, `dev:firefox`, `build`, `build:firefox`, `zip`, `zip:firefox`,
`typecheck`, `lint`, `lint:fix`, `format`, `test`, `test:watch`,
`test:coverage`, `e2e`, `prepare` (`wxt prepare`).

---

## 10. Milestone plan & acceptance

**M0 — Scaffold & quality harness.** All §8 tooling wired; one trivial passing
unit test; both browser builds produce valid zips; CI green end-to-end; hooks
active. *Acceptance:* fresh clone → `pnpm i && pnpm test && pnpm build` passes;
CI green on a no-op PR.

**M1 — Annotation core (this spec).** §5 architecture, §7 toolset, clipboard
export, persistence, options page, with coverage and e2e per §8. *Acceptance:*
on a fixture page, all seven tools draw and render in a shadow root; callouts
auto-number and renumber on delete; export places Markdown+PNG on the clipboard;
Markdown contains correct `Element:` selector lines that `resolveSelector`
round-trips; coverage thresholds met; Chromium e2e green; Chrome + Firefox zips
build.

**M2 — Persistence & agent interaction (in progress).** The agent path ships as a
`DaemonSink` (behind the §5.4 `ExportSink` interface, no changes to
capture/drawing/model) plus the cross-platform Rust **`share-the-mark` CLI** under `cli/`:

- Transport: a localhost HTTP daemon (`share-the-mark serve`, default `127.0.0.1:8787`). The
  extension's background SW POSTs the brief (Markdown + base64 PNG) to `/brief`
  under one loopback `host_permission`; `/health` and `/shutdown` drive a portable
  lifecycle (`start`/`stop`/`status`) with no OS signals.
- Lifecycle: explicit `share-the-mark serve`/`share-the-mark start` run until stopped; daemons that
  `share-the-mark request` auto-starts get an idle timeout (`--idle-timeout`/`SHARE_THE_MARK_IDLE`,
  default 30 min) so they self-shut-down and don't linger as strays.
- Persistence: `<dir>/briefs/<id>/{brief.md,screenshot.png,meta.json}` with
  read/unread state (per-OS data dir, or `SHARE_THE_MARK_DIR`).
- Agent integration: the CLI itself (`share-the-mark pending` / `share-the-mark list` / `share-the-mark show <id>`)
  plus a bundled **Claude Code skill** (`share-the-mark skill install`); on send, the panel
  surfaces a handoff token (`share-the-mark show <id>`) to paste to the agent. (Chosen over
  MCP for tool-agnostic simplicity.)
- Agent-initiated: `share-the-mark request <url>` registers an open request, opens the page,
  and **blocks** until a same-origin brief is sent (daemon correlates on
  `POST /brief`, marks it read, fulfills the request via short-poll) — the command
  returning wakes a backgrounded agent. Auto-starts the daemon.

Still deferred: `FileSystemSink` (File System Access API), native side panel,
Firefox e2e via `web-ext`.

**M3 — Distribution & discoverability.** Make both halves installable by real
users and able to find each other (§11). Extension submitted to the Chrome Web
Store + Firefox AMO (listing copy in `store/LISTING.md`); a tag-triggered release
workflow publishes CLI binaries (+ checksums), a signed self-distributed Firefox
`.xpi`, and the Chrome zip to GitHub Releases; the CLI reaches users via a
Homebrew tap, `cargo install` / `cargo-binstall`, a `curl | sh` installer, and an
`npx` wrapper. In-product cross-discovery wires the Options toggle, the panel's
daemon-unreachable state, the `serve` banner, and a new `share-the-mark setup` /
`doctor` command to the opposite half's install path.

**M4 — Cross-machine sharing (share tokens).** Human-to-human handoff with no
daemon and no screenshot (§12): a compressed `stm1:` token carrying
`{ url, annotations }` is copied to the clipboard and pasted into the recipient's
extension, which opens the URL and re-renders the marks live against the content
anchors. Additive — the daemon and the M2 agent brief are untouched.

## 11. Distribution & discoverability

Two independently-distributed halves (extension + CLI) that must each onboard
alone and find each other. **Foundational framing: `127.0.0.1` means the same
machine.** There are two handoff modes, and the CLI is never on the annotator's
critical path:

- **Clipboard / share token (§12)** — the cross-person, cross-machine path:
  annotate → copy → paste; no CLI.
- **Local daemon (§5.4 `DaemonSink`, §10 M2)** — the same-machine power-up: one
  person annotates and runs the agent on the same box.

The extension is therefore independently complete; the CLI is revealed only when
the user actually runs an agent locally.

### 11.1 Discoverability spine

One canonical install hub (the README, optionally GH Pages): store buttons, the
CLI one-liners, the Firefox `.xpi` link, and a short "how the halves fit." Every
surface links to it — store listing, CLI banner, skill, options page — so the two
halves never drift in their install story.

### 11.2 Entry points

- **Extension-first → wants the agent.** The Options "Agent integration" toggle
  reveals CLI install one-liners + the hub link at the moment of intent; the
  panel's daemon-unreachable state becomes an actionable "install the CLI" CTA
  instead of a dead-end string.
- **CLI-first → wants to annotate.** `serve` / `start` print a banner with the
  extension store links; a `share-the-mark setup` / `doctor` command installs the
  skill, prints daemon status, and `open`s the right store for the default
  browser (the `open` crate is already a dependency); `SKILL.md` links the
  extension.
- **Store-averse.** Firefox: a self-distributed **signed `.xpi`** (AMO signing
  API / `web-ext sign`) on GitHub Releases installs in one click and auto-updates
  without a public listing. Chrome: no clean no-store path on stable — document
  unpacked-from-zip for tinkerers and enterprise force-install for orgs; the Web
  Store is the real unblock.

### 11.3 CLI install matrix

The blocker is shared: CI builds the 3-OS matrix but uploads nothing. A
tag-triggered release workflow uploads per-OS/arch tarballs + `.sha256`; every
channel layers on top.

- **GitHub Releases** — per-target tarballs + checksums; the foundation every
  other channel reads from.
- **Homebrew** — a formula in the existing common-tools tap, bumped by the
  release workflow.
- **cargo / cargo-binstall** — `cargo publish` plus a `[package.metadata.binstall]`
  asset-name pattern so binstall finds the prebuilt asset.
- **`curl | sh`** — an in-repo `install.sh` that detects OS/arch and pulls the
  matching Release asset.
- **npm wrapper** — a package whose postinstall downloads the prebuilt binary
  (the esbuild/swc pattern); exposes `npx share-the-mark` for the Node audience.

### 11.4 Version compatibility

`/health` already returns the daemon version; the extension must read it. On a
major / declared-floor mismatch, surface a soft "update your CLI" notice rather
than failing silently; the `POST /brief` body carries the extension version so the
daemon can warn the other way. Compatibility is a declared floor, not lockstep —
the halves release independently.

## 12. Cross-machine sharing (`stm1:` share tokens)

Human-to-human handoff with **no daemon and no screenshot**. Annotations are
content-anchored and viewport-independent (§5.3, point-anchored model), so the
page itself is the screenshot: open the same URL anywhere and `resolveGeometry`
re-derives the marks against the live DOM. The transferred artifact is the model,
not a raster. Scope is deliberate — a new cross-machine *mode*, additive; the
daemon, `DaemonSink`, M2 persistence, and the agent brief (Markdown + PNG) are
untouched.

### 12.1 Token format

```
stm1:<base64url( gzip( JSON({ v, url, title, capturedAt, fingerprint, annotations }) ) )>
```

- `gzip` via the native `CompressionStream` / `DecompressionStream` — no
  dependency, so the §8.7 size budget is unaffected; the TextQuote prefix/suffix
  context compresses well.
- `fingerprint` — a small pure non-crypto hash (cyrb53) over the content fields
  (`url`, `title`, `capturedAt`, `annotations`), used as a **paste-integrity**
  check: a chat client that truncates or mangles the token fails to validate
  rather than importing garbage. Page-drift detection is the placement summary
  (§12.4), not this.
- `v` and the `stm1:` magic gate compatibility; an older recipient reports
  "needs a newer version" rather than mis-parsing a newer token.

### 12.2 Modules

- **`src/core/share` (pure)** — envelope type; `buildBrief(changelog)`;
  `validateBrief(unknown)` (discriminated result, never throws); `isSameTarget`
  (host+path URL compare). Held to the §8.4 100% core bar; no stream APIs, to stay
  browser-free.
- **`src/share` (glue)** — `token.ts` (`encodeToken` / `decodeToken`: gzip +
  base64url around the pure builders) and `import.ts` (`claimPendingImport`,
  `summarizePlacement`), kept pure-ish for unit tests.
- **`src/storage/pending-import.ts`** — a single-slot handoff (`savePendingImport`
  / `loadPendingImport` / `clearPendingImport`).
- **Export — panel "Copy share link"** — `content.ts` serializes the live
  `Changelog` → `encodeToken` → `navigator.clipboard.writeText` (text only, no
  `image`); publishes the token to `dataset.stmLastShare` for e2e.
- **Import (new) — popup "Open a shared mark…"** — paste → `decodeToken` →
  `validateBrief` → preview "N marks" → `savePendingImport` +
  `browser.tabs.create({ url })`. No `tabs` permission and no new message: the
  new tab's content script `claimPendingImport` on startup (fresh slot +
  `isSameTarget`), hydrates via the existing `replaceAll` action, clears the slot,
  and auto-mounts so the marks show without a "Start annotating" click.
- **Drift UX — panel placement summary** — `summarizePlacement` counts placed vs
  `resolveGeometry === null`; renders "placed N of M" and lists orphaned marks
  (note/text preserved), with a "page changed since capture" note when any orphan.

### 12.3 Two design calls

- **Share is its own action, not an `ExportSink`.** The sinks consume the
  rendered `{ markdown, image }` payload; the token needs the annotation *model*.
  A sibling action serializes it directly rather than fighting the interface.
- **Import hydrates via a storage handoff, not a live message.** The popup stashes
  the decoded brief in a single storage slot and opens the target URL in a new tab;
  that tab's content script claims the slot on startup. This needs no `tabs`
  permission (can't match an existing tab by URL) and no message race against a
  still-loading tab — and it matches the real flow, since a recipient pasting a
  token from chat usually isn't on the page yet.

### 12.4 Drift handling — best-effort

Always render what resolves. The panel reports "placed N of M" and lists orphaned
marks (their note/text preserved) so nothing is lost; an orphan count > 0 is the
"page changed since capture" signal (the `fingerprint` is integrity only, §12.1),
never a hard block. Auth-walled or ephemeral URLs that won't reload the same
content are the failure floor — the marks can't place, and the summary says so.

### 12.5 Validation & security (pure, tested)

Reject non-`http(s)` URLs; cap the token length (before decoding) and the
annotation count (`MAX_ANNOTATIONS`); version-gate on `v`. Import executes no
code — it is data → a validated model — and the popup previews the page and mark
count before the user opens the tab.
