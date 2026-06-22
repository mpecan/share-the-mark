---
name: share-the-mark
description: Read design-feedback change-briefs captured by the share-the-mark browser extension via the local `share-the-mark` CLI. Use when the user pastes a `share-the-mark show <id>` command, mentions a share-the-mark brief / mark / change-brief, or asks to act on visual/design feedback from a web page.
---

# share-the-mark

The [**share-the-mark** browser extension](https://github.com/mpecan/share-the-mark)
lets a person annotate a live web page (callouts, text notes, arrows, highlights,
element comments) and send the result — a Markdown **change-brief** plus an annotated
screenshot — to a local daemon. The `share-the-mark` CLI is how you, the agent, read
those briefs and act on the feedback. The extension is the usual capture surface, but
the CLI can also collect feedback **without it** — serving a local HTML artifact, or
driving a headed Playwright browser for a remote URL (see `request` below).

Each brief contains, per annotation, the author's note and a resolved CSS
`Element:` selector pointing at the exact element on the page. Treat it as
actionable design/UX feedback on the corresponding source.

## Commands

- `share-the-mark request <target>` — **ask the user for feedback, and block until it
  arrives.** Opens the page, waits for the user to annotate it and click "Send to
  agent", then prints the resulting brief (Markdown + screenshot path) and returns —
  the command returning is your signal to continue. `<target>` can be:
  - a **URL** → opens it in the user's own browser (needs the extension installed);
  - a **local HTML file/dir** (e.g. `./preview.html`) → the daemon serves it with the
    panel injected, **no extension needed** — ideal right after you generate an HTML
    artifact and want design feedback on it;
  - `--playwright <url>` → drives a **headed Playwright browser** the CLI controls, so a
    remote page works with **no extension** (requires Node + Playwright on PATH).

  `--json` for a machine-readable object; `--timeout <secs>` (default 600).

- `share-the-mark pending` — list briefs that haven't been read yet (id · source · captured).
- `share-the-mark list` — list recent briefs (add `--all` for every brief).
- `share-the-mark show <id>` — print a brief's Markdown to stdout and the path to its
  annotated screenshot; this marks it read (use `--keep-unread` to leave it).
  Add `--json` for a machine-readable object.

## Workflows

**You want feedback on a page** (agent-initiated): run `share-the-mark request <url>` — e.g.
after making a UI change, `share-the-mark request http://localhost:3000/checkout`. It opens
the page, waits for the user, and returns the brief. For an HTML file you just generated,
point it at the file (`share-the-mark request ./out/page.html`); for a remote page when the
user has no extension, add `--playwright`. Either way the command returns the brief —
then act on it (step 3 below).

**The user has feedback for you** (user-initiated):

1. When the user pastes `share-the-mark show <id>`, just run it.
2. Otherwise, when they reference marks/briefs/feedback, run `share-the-mark pending` to
   discover unread briefs, then `share-the-mark show <id>` for the relevant one(s).

In both cases:

3. Read the printed Markdown. For each item, map the `Element:` selector and note
   to the source, **view the screenshot** at the printed path for visual context,
   and make the requested change.
4. If `share-the-mark` is missing, the daemon may not be installed/running — tell the user to
   run `share-the-mark setup` (installs this skill, opens the extension page, and reports
   daemon status), then `share-the-mark serve` (or `share-the-mark start`). They also need the
   [browser extension](https://github.com/mpecan/share-the-mark) — it's the other half.
   `share-the-mark request` auto-starts the daemon for you.
