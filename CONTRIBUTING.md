# Contributing to share-the-mark

Thanks for your interest in contributing! This project is open source under the
[MIT License](./LICENSE). By submitting a contribution you agree that your work
is licensed under the same terms.

## Ground rules

- **`SPEC.md` is the source of truth.** It defines the architecture, the
  milestone plan, and a non-negotiable quality bar. Read the relevant sections
  before starting non-trivial work.
- Work milestone by milestone. M1 (annotation core) is complete; M2 features
  (filesystem/native-host export sinks, native side panel, Firefox e2e) are
  deferred — open an issue to discuss before starting M2 work.

## Prerequisites

- **Node 22** — pinned in `.tool-versions` (use [mise](https://mise.jdx.dev) or
  `nvm`). CI runs on Node 22.
- **pnpm** — the only supported package manager (`packageManager` is pinned in
  `package.json`).

## Setup

```bash
pnpm install          # also runs `wxt prepare` and installs git hooks (lefthook)
pnpm dev              # Chrome dev build with hot reload
pnpm dev:firefox      # Firefox dev build
```

To load a production build unpacked: `pnpm build`, then load `.output/chrome-mv3`
(Chrome: `chrome://extensions` → Developer mode → Load unpacked) or
`.output/firefox-mv2/manifest.json` (Firefox: `about:debugging`).

## Quality bar (enforced on every commit — SPEC §8)

A change is done only when **all** of these pass:

```bash
pnpm typecheck        # tsc --noEmit (strict, plus extra strictness — SPEC §8.1)
pnpm lint             # eslint, zero warnings allowed
pnpm test             # vitest; coverage thresholds enforced
pnpm build            # Chrome
pnpm build:firefox    # Firefox
pnpm size             # gzip bundle budget
pnpm e2e              # Playwright (requires a prior `pnpm build`)
```

Coverage thresholds are CI-enforced and stricter for the pure core:

- Global: lines/statements/functions ≥ 90%, branches ≥ 85%.
- `src/core/**`: 100% lines/functions/statements, ≥ 95% branches.

Run a single test with `pnpm vitest run path/to/file.test.ts` (or `-t "name"`).

Git hooks (lefthook) run lint + format + typecheck on commit, commitlint on the
message, and the test suite on push.

## Architecture invariants

These keep the codebase portable and testable — don't violate them:

- Use WXT's unified **`browser.*`** global; never reference `chrome.*`.
- **`src/core/**` is pure and browser-free\*\* (selector engine, model, markdown,
  export payload). No extension/DOM-side-effecting APIs there.
- The drawing **overlay is imperative TypeScript, not React** — it must stay at
  60fps. React is only for static-ish UI (popup, options, changelog panel).
- UI mounts into a **closed shadow root** so host-page CSS can't bleed in or out.
- Export goes through the **`ExportSink`** interface; M1 ships only
  `ClipboardSink`.

## Commits & pull requests

- Commits follow [Conventional Commits](https://www.conventionalcommits.org)
  (enforced by commitlint): `feat:`, `fix:`, `chore:`, `docs:`, `test:`, …
- Keep PRs focused and green: the full quality bar above must pass.
- Describe what changed and why, and reference the relevant `SPEC.md` section.

## Reporting issues

Open an issue with steps to reproduce, the affected browser(s), and the page (or
a minimal fixture) where the problem occurs.
