---
name: share-the-mark
description: Read design-feedback change-briefs captured by the share-the-mark browser extension via the local `stm` CLI. Use when the user pastes an `stm show <id>` command, mentions a share-the-mark brief / mark / change-brief, or asks to act on visual/design feedback from a web page.
---

# share-the-mark

The **share-the-mark** browser extension lets a person annotate a live web page
(callouts, text notes, arrows, highlights, element comments) and send the result —
a Markdown **change-brief** plus an annotated screenshot — to a local daemon. The
`stm` CLI is how you, the agent, read those briefs and act on the feedback.

Each brief contains, per annotation, the author's note and a resolved CSS
`Element:` selector pointing at the exact element on the page. Treat it as
actionable design/UX feedback on the corresponding source.

## Commands

- `stm request <url>` — **ask the user for feedback on a page.** Opens `<url>` in
  their browser and blocks until they annotate it and click "Send to agent", then
  prints the resulting brief (Markdown + screenshot path) and returns. Use this to
  proactively request design feedback; the command returning is your signal to
  continue. `--json` for a machine-readable object; `--timeout <secs>` (default 600).
- `stm pending` — list briefs that haven't been read yet (id · source · captured).
- `stm list` — list recent briefs (add `--all` for every brief).
- `stm show <id>` — print a brief's Markdown to stdout and the path to its
  annotated screenshot; this marks it read (use `--keep-unread` to leave it).
  Add `--json` for a machine-readable object.

## Workflows

**You want feedback on a page** (agent-initiated): run `stm request <url>` — e.g.
after making a UI change, `stm request http://localhost:3000/checkout`. It opens
the page, waits for the user, and returns the brief. Then act on it (step 3 below).

**The user has feedback for you** (user-initiated):

1. When the user pastes `stm show <id>`, just run it.
2. Otherwise, when they reference marks/briefs/feedback, run `stm pending` to
   discover unread briefs, then `stm show <id>` for the relevant one(s).

In both cases:

3. Read the printed Markdown. For each item, map the `Element:` selector and note
   to the source, **view the screenshot** at the printed path for visual context,
   and make the requested change.
4. If `stm` is missing, the daemon may not be installed/running — tell the user to
   run `stm serve` (or `stm start`). `stm request` auto-starts the daemon for you.
