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
│  ├─ embed/                      # browser-free mount() + adapters (§13, M5)
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
- **`content.ts`** — overlay + panel in a shadow root. `registration: 'runtime'`
  (not in the manifest's `content_scripts`), injected on demand by the background
  under `activeTab` when the user activates from the popup — so the install requests
  no broad host access. Auto-mounts on injection; guards against a double mount.
- **`popup/`** — React. Activate/deactivate annotation mode, open options.
- **`options/`** — React. Settings (default tool, stroke defaults, Markdown
  extraction prefs).

---

## 6. Cross-browser strategy

- **Always** use WXT's unified `browser.*` global; never reference `chrome.*`.
- Single MV3 build for Chromium targets and Firefox. WXT resolves the
  background service-worker vs event-page difference and namespace differences.
- **Permissions (least-privilege):** `activeTab`, `scripting`, `storage`, and **no
  `host_permissions`** — so there is no "read and change all your data on all
  websites" install warning. The content script is injected under `activeTab` +
  user gesture (`scripting.executeScript`); `tabs.captureVisibleTab` works the same
  way. `<all_urls>` is declared **optional** (warning-free at install) and requested
  per-origin at runtime only when the user opens a shared mark (§12). A
  `build:manifestGenerated` hook strips the `<all_urls>` that runtime registration
  would otherwise add to `host_permissions`; `pnpm check:perms` guards the property.
  The daemon loopback host is likewise optional (§10 M2).
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

**M2 — Persistence & agent interaction (shipped).** The agent path ships as a
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

**M4 — Cross-machine sharing (share tokens) (shipped).** Human-to-human handoff
with no daemon and no screenshot (§12): a compressed `stm1:` token carrying
`{ url, annotations }` is copied to the clipboard and pasted into the recipient's
extension, which opens the URL and re-renders the marks live against the content
anchors. Additive — the daemon and the M2 agent brief are untouched.

**M5 — Extension-less / embeddable delivery (§13) (shipped).** Factor the overlay+panel
orchestration out of `content.ts` into a browser-free `src/embed` core
(`mount(adapters)`), add a `BindingSink`, and ship three no-extension channels:
Playwright injection (A), a dev/staging `<script>`/npm widget (B), and a
local-serve artifact loop that injects the panel and POSTs feedback to the M2
daemon (C). *Acceptance:* `content.ts` consumes `mount()` with no regression
(all §8 gates green); a Playwright spec draws a mark on an arbitrary CSP page with
no extension loaded and asserts the exported Markdown via a binding; the embed
IIFE builds within its size budget; the CLI serves an artifact from a loopback
origin and a brief reaches `share-the-mark pending`. Bookmarklet/userscript/proxy are
explicitly out of scope (§13.7).

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

### 11.2 Entry points (shipped)

The cross-linking is implemented; the canonical hub is the GitHub repo
(`HUB_URL` in `src/core/links.ts` / `cli/src/links.rs`) until the store URLs are
approved, after which they swap into those two constants.

- **Extension-first → wants the agent.** The Options page carries an "Install the
  CLI" block (copy-paste brew / binstall / curl commands + the hub link); the
  panel's daemon-unreachable and not-permitted states are actionable — an "Open
  setup" button that messages the background to `runtime.openOptionsPage()` (a
  content script can't), and a version-mismatch handoff links the hub.
- **CLI-first → wants to annotate.** `serve` / `start` print a banner pointing at
  the extension; `share-the-mark setup` installs the skill, `open`s the extension
  hub (the `open` crate is already a dependency; `--no-browser` to skip), and
  reports daemon status; `request` prints an install hint while it blocks;
  `SKILL.md` links the extension. (A separate `doctor` diagnostic is deferred.)
- **Store-averse.** Firefox: a self-distributed **signed `.xpi`** (AMO signing
  API / `web-ext sign`) on GitHub Releases installs in one click and auto-updates
  without a public listing. Chrome: no clean no-store path on stable — document
  unpacked-from-zip for tinkerers and enterprise force-install for orgs; the Web
  Store is the real unblock.

### 11.3 Releasing & the CLI install matrix

**release-please** (`release-please-config.json`, `.release-please-manifest.json`,
`.github/workflows/release-please.yml`) drives versioning from Conventional Commits.
It maintains a release PR per package — the extension (`.`, node, tag `extension-v*`)
and the CLI (`cli/`, rust, tag `cli-v*`) version independently; merging one bumps the
version + CHANGELOG and publishes a GitHub Release. It runs under a GitHub App token so
those Releases trigger the publish workflows (GITHUB_TOKEN-published releases don't).

A `cli-v*` Release fans out via `release-cli.yml` (`on: release: published`); an
`extension-v*` Release attaches the store zips via `release-extension.yml`. The CLI
install matrix layers on the Release assets:

- **GitHub Releases** — *done.* The 5-target matrix (linux gnu x86_64/aarch64, darwin
  x86_64/aarch64, windows msvc) via `taiki-e/upload-rust-binary-action` attaches
  `share-the-mark-<target>.<archive>` + checksums; the foundation every channel reads.
- **`curl | sh`** — *done.* In-repo `install.sh` detects OS/arch and pulls the matching
  Release asset (with checksum verification).
- **cargo / cargo-binstall** — *done.* An idempotent `cargo publish` job puts the crate
  on crates.io (so `cargo install share-the-mark` works); `[package.metadata.binstall]`
  in `cli/Cargo.toml` points `cargo binstall` at the Release assets.
- **Homebrew** — *done.* The workflow generates `Formula/share-the-mark.rb` (per-target
  url + sha256) and pushes it to the `mpecan/homebrew-tools` tap via the App token:
  `brew install mpecan/tools/share-the-mark`.
- **npm wrapper** — deferred (`npx share-the-mark`, esbuild-style binary download).

### 11.4 Version compatibility — *done*

The two halves release independently, so compatibility is a **declared floor**, not
lockstep. `GET /health` returns the daemon `version` and the `minExtension` it
supports. Before "Send to agent", the extension reads `/health` and runs
`checkDaemonCompat` (`src/core/version`, pure + 100% covered) in both directions
against its own `runtime.getManifest().version` and a `MIN_DAEMON_VERSION` floor: if
the daemon is below the extension's floor it shows "update your CLI"; if the
extension is below the daemon's `minExtension` it shows "update the extension" —
instead of sending to a daemon that can't read the brief (and before paying for the
screenshot). It **fails open**: a missing or unparseable version never blocks a send.

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

## 13. Extension-less / embeddable delivery

The extension is one *delivery vehicle*, not the product. The product is the
annotation UI (overlay + panel) and the content-anchored model. This section
makes that UI usable **without the extension installed** in three settings:
**(A)** driven by Playwright for automation, **(B)** dropped into a developer's
own dev/staging build as a `<script>`/npm widget, and **(C)** the headline case —
a CLI/agent serves an artifact locally, the user annotates it in-page, and the
feedback flows back to wake the agent (the "Claude Code shares an artifact and
asks for feedback" loop). Additive: the extension, the §5.4 sinks, the M2 daemon,
and the §12 share tokens are untouched; this factors out a reusable core they all
already sit on.

> **Revision (as-built, M5):** all three channels shipped on the browser-free
> `src/embed` core (`mount()` + `StorageAdapter`/`ScreenshotProvider` adapters)
> with `content.ts` reduced to WXT-adapter construction, plus `BindingSink`. The
> embed IIFE is built by `scripts/build-embed.mjs` into three bundles
> (`embed.global.js` for A, `share-the-mark.global.js` / `ShareTheMark.init` for
> B, `local.global.js` for C). Two deltas to §13.6 worth carrying:
> - **The local-serve verb is `share-the-mark request <path|dir>`** (register →
>   serve → block for the brief), *not* `serve --artifact`; `serve`/`start` are the
>   long-running daemon. `request` POSTs the artifact to `/request`; the daemon
>   serves it at `/artifact/<id>/…` with the panel `<script>` injected per HTML
>   response, and the panel POSTs the brief back to `/brief` (same loopback
>   origin). The injected `local.global.js` is **baked into the binary**
>   (`include_bytes!` via `build.rs`), so an installed CLI is self-contained;
>   `--bundle <path>` / `SHARE_THE_MARK_EMBED_BUNDLE` override it for dev.
> - **The emitted CSP** is `default-src 'self'; script-src 'self' 'unsafe-inline';
>   style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'
>   data: blob:; font-src 'self' data:`. `connect-src` **must** include `data:`/`blob:`
>   because the screenshot compositor `fetch()`es the captured PNG as a `data:` URL —
>   a `@cli` Channel C browser e2e (`tests/e2e/cli-local-serve.spec.ts`) caught the
>   omission (the export failed silently and no brief was sent).
>
> **Deferred against §13.6/§13.8:** the daemon is **loopback-bound (`127.0.0.1`)**
> but its JSON API still returns `Access-Control-Allow-Origin: *` and does **not**
> validate `Origin`; the "scope CORS to the page origin / never `*` / validate
> Origin" hardening is not yet done (low risk while loopback-only, but tracked). No
> SSE/WebSocket back-channel (the agent polls via `pending`/`show`); no npm
> `@share-the-mark/embed` publish yet (the IIFE ships built, not packaged); no
> Firefox Channel A e2e.

### 13.1 The enabling fact — the UI is already browser-free

`src/overlay/**` and `src/panel/**` import **zero** `browser.*`/WXT APIs today.
The overlay is a pure DOM controller taking a `container: HTMLElement` plus
callbacks (`onCreate`/`onUpdate`/`caretFromPoint`/`elementFromPoint`,
`overlay.ts`); the panel is pure React over an injected `PanelStore` + handler
props (`PanelApp.tsx`). `claimPendingImport`/`resolveGeometry` re-render marks
against a live DOM with no extension dependency, and tokens use the native
`CompressionStream`. **All** extension coupling lives in one orchestration file
(`entrypoints/content.ts`) and three thin seams: screenshot capture
(`browser.tabs.captureVisibleTab` via `requestScreenshot()`), WXT `storage`, and
the `defineExtensionMessaging` bus. So this is a **packaging/adapter** job, not a
rewrite of the hot path.

### 13.2 The embeddable core (`src/embed`)

Factor the orchestration that today lives inline in `content.ts` into a
browser-free `mount()` that the extension *and* the new channels both call:

```ts
interface HostAdapters {
  container: HTMLElement;                       // any node; shadow root recommended
  storage: StorageAdapter;                      // { get, set, remove } — see below
  screenshot: ScreenshotProvider;               // () => Promise<Blob | null>
  sink: ExportSink;                             // §5.4 — Clipboard | Binding | Http
  getVersion?: () => string;                    // replaces getManifest().version
  resolveTarget?: ResolveTarget;                // existing seam, unchanged
}
interface StmHandle { open(): void; close(): void; destroy(): void; }
function mount(adapters: HostAdapters): StmHandle;
```

- **`StorageAdapter`** — a 3-method async interface (`get`/`set`/`remove`). The
  extension implements it over WXT `storage`; the embed channels implement it over
  `localStorage`/`sessionStorage` or an in-memory `Map`. `src/storage/*` keeps its
  WXT-backed implementation as *one* adapter, not the only one.
- **`ScreenshotProvider`** — the only genuinely hard seam, because
  `captureVisibleTab` is extension-only. The contract returns `Blob | null`;
  `null` means "no raster" and the export degrades to Markdown-only (the §12
  rationale — the live DOM *is* the screenshot — applies). Providers: extension →
  the existing SW round-trip; Playwright → `page.screenshot()` bridged in; dev
  embed → optional `html2canvas`-class provider or `null`.
- **`mount()` is pure-ish and unit-testable**; it must not import `wxt/*` or
  `browser`. The extension's `content.ts` becomes a thin file that builds the WXT
  adapters and calls `mount()`. `src/core/**` stays at its §8.4 100% bar.

### 13.3 `BindingSink` — the headless/automation export path

Add a third `ExportSink` (§5.4) alongside `ClipboardSink`/`DaemonSink`.
`BindingSink.write(payload)` hands `{ markdown, image }` to an injected
`(payload) => Promise<void>` callback instead of touching `navigator.clipboard`.
This is load-bearing: writing a `ClipboardItem` with `image/png` **fails in
headless Chromium** (Playwright #24039) and `clipboard-write` is denied headless
even when granted (#29472). The Binding callback is wired to Playwright
`exposeBinding` (page → Node) in channel A, and can post to the daemon in channel
C. Keeps the `dataset.stmLastExport` publish as a pull-based fallback for
assertions.

### 13.4 Channel A — Playwright (automation, CSP-immune)

Playwright controls the browser process, so page CSP does not apply to the
injected world — the only no-extension path that works on **arbitrary hardened
pages**.

- **Inject + persist:** `context.addInitScript()` mounts the embed bundle into a
  shadow root and **re-runs on every navigation/reload/child-frame**, so the UI
  survives reloads for free. Register before `goto`.
- **CSP:** drive via `page.evaluate()` (isolated world, immune). **Avoid**
  `addScriptTag` (subject to page CSP; needs `bypassCSP: true`).
- **Data out:** `BindingSink` → `exposeBinding` (push), with `dataset` read as the
  pull fallback. Do **not** assert the real clipboard in headless CI.
- Ships as `src/embed/playwright.ts` (a Node-side `attach(page, opts)` helper) +
  the browser bundle. This generalizes what the M1 e2e harness already does.

> **Revision (as-built):** beyond the automation `attach()` helper, channel A also
> ships an **interactive** driver: `share-the-mark request --playwright <url>` launches
> a **headed** Chromium the user annotates by hand, with no extension. It's a Node
> runner (`src/embed/playwright-runner.ts` → `playwright-runner.mjs`) that inlines the
> channel-A bundle and POSTs the brief to the daemon `/brief` — so the Rust CLI's
> existing register→poll loop fulfils the open request unchanged. `playwright` is
> **resolved from the user's environment** at runtime (project `node_modules`, cwd /
> `NODE_PATH`, or the npm global root), never baked into the binary, so `--playwright`
> is opt-in and errors with install guidance when absent. The runner `.mjs` *is* baked
> into the binary (`include_bytes!`, alongside the channel-C bundle) and staged to a
> temp file to run.

### 13.5 Channel B — dev/staging script-tag embed

For teams who own the page source. A single bundle exposing a global with the
proven feedback-widget shape (marker.io / Sentry / Userback):

```js
const stm = ShareTheMark.init({ /* HostAdapters subset + onSubmit */ });
stm.open(); stm.destroy();      // explicit teardown; render into a shadow root
```

- Style isolation via **Shadow DOM** (as today). No CSP fight: the developer adds
  the bundle's origin to their own `script-src`/`connect-src` allowlist; document
  the exact directives in `store/`/README. Gate behind an env flag so it never
  ships to prod.
- Distribution: `@share-the-mark/embed` on npm + a CDN `<script src>`; the build
  emits a self-contained IIFE (no WXT). Tracked against a separate size budget.

### 13.6 Channel C — local-serve artifact loop (the headline case)

Here we control the **server**, so we get channel-B robustness without asking
anyone to touch a CSP — and it reuses the existing `127.0.0.1:8787` daemon.

- **Serve + inject:** a new CLI verb (`share-the-mark serve --artifact <path|dir>`, or a
  framework plugin using Vite's `transformIndexHtml`) serves the artifact and
  **injects the embed `<script>` into every HTML response**. Re-injected per
  response ⇒ survives reloads for free, like an HMR client. We emit the HTML, so
  we emit a permissive CSP alongside it.
- **Back-channel:** the panel POSTs the brief to the daemon `/brief` (the M2 path)
  to wake the agent; add SSE/WebSocket only if the agent must push progress *back*
  to the panel. The agent reads it via the existing `share-the-mark pending`/`show` + skill.
- **Chrome 142 Local Network Access (design around this now):** LNA (shipped
  ~Oct 2025) prompts on **public → loopback** requests and **silently fails** if
  dismissed; **loopback → loopback is currently exempt**. Therefore **serve the
  artifact from a `127.0.0.1`/`localhost` origin** so the panel→daemon call stays
  on the unrestricted path. Chrome has flagged it will eventually restrict this —
  do not treat the exemption as permanent.
- **Daemon hardening:** validate `Origin` on every request and on any WebSocket
  upgrade; scope CORS to the loopback page origin (never `*`). The 2025 Vite dev-
  server advisory (GHSA-vg6x-rcgg-rjx6) is the cautionary tale.

### 13.7 What this is *not*, and the CSP floor

There is **no** general way to inject into a truly arbitrary, CSP-hardened,
*authenticated* page without controlling the browser or the server. We
deliberately do **not** ship: a **bookmarklet** (inline runs, but loading the real
bundle via external `<script src>` is blocked by `script-src 'self'`; no
persistence), a **userscript** (works but requires the user to install a manager —
"an extension by another name" — and its CSP-rewrite power is degrading under
MV3), or a **proxy/"Via"-style rewriter** (breaks on auth cookies, SPA routing,
and SRI; Hypothesis itself is restricting Via to partners from Feb 2026). Each
ships only if a concrete partner need overrides this. The supported matrix maps
each scenario to the layer we actually control: **A** owns the browser, **B** owns
the page source, **C** owns the server.

### 13.8 Layout & quality

- `src/embed/` — `mount.ts` (the browser-free orchestrator), `adapters.ts`
  (`StorageAdapter`/`ScreenshotProvider` interfaces + `localStorage`/in-memory
  impls), `playwright.ts` (Node-side attach helper), `widget.ts` (the
  `ShareTheMark.init` global for channel B). `src/core/export` gains `BindingSink`.
- `entrypoints/content.ts` shrinks to WXT-adapter construction + `mount()`.
- Gates unchanged (§8): `mount`/adapters are unit-tested with fakes; `src/core/**`
  stays 100%; a new Playwright spec drives channel A end-to-end (draw → assert
  exported Markdown via the binding); a separate size budget covers the embed IIFE.
