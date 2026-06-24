---
title: Connect a coding agent
description: The share-the-mark CLI/daemon receives change-briefs from the extension and hands them to a coding agent — plus agent-initiated and extension-less request flows.
sidebar:
  order: 4
---

`share-the-mark` is a small cross-platform (macOS/Linux/Windows) Rust CLI under
[`cli/`](https://github.com/mpecan/share-the-mark/tree/main/cli) that receives
change-briefs from the extension and exposes them to a coding agent.

## Install the CLI

Pick one:

```bash
# Prebuilt binary via curl | sh (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/mpecan/share-the-mark/main/install.sh | sh

# Prebuilt binary via cargo-binstall (all platforms)
cargo binstall share-the-mark

# Homebrew (macOS/Linux)
brew install mpecan/tools/share-the-mark

# From source (needs a Rust toolchain + Node, for the embedded annotation UI)
mise run cli:install        # builds the embed bundle, then `cargo install --path cli`
```

:::caution
Installing from source with a bare `cargo install --path cli` skips the
embed-bundle build, so the local-serve UI (`request <path>`) would be empty. Use
`mise run cli:install` (above), or run `pnpm build:embed` first. Prebuilt binaries
/ crates.io / Homebrew all bundle the UI already.
:::

You can also download a binary for your platform from the
[Releases](https://github.com/mpecan/share-the-mark/releases) page. Then:

```bash
share-the-mark setup          # install the skill, open the extension page, report daemon status
share-the-mark start          # launch the ingest daemon in the background (use `serve` to run it in the foreground)
share-the-mark skill install  # install the Claude Code skill into ~/.claude/skills
```

The extension and the CLI are two halves of one tool — neither does anything alone.
`share-the-mark setup` is the fastest way to wire up the agent side: it installs
the Claude Code skill and points you at the extension. The extension's Options page
returns the favor with copy-paste CLI install commands.

## Send a brief to your agent

In the extension panel, click **Send to agent**. The daemon stores the brief
(`brief.md` + annotated `screenshot.png`) and the panel shows a handoff token:

```text
✓ sent — paste to your agent: share-the-mark show ab12
```

Paste that to your agent (or just ask it about your marks — the installed skill
teaches it to run `share-the-mark pending` / `share-the-mark show <id>`). The agent
reads the Markdown (element selectors + your comments) and the screenshot, and acts
on the feedback.

## Agent-initiated requests

An agent can also ask _you_ for feedback: `share-the-mark request <url>` opens the
page in your browser and blocks until you annotate it and click **Send to agent**,
then returns the brief — which wakes a backgrounded agent (e.g. Claude Code) so it
can act on your comments.

### Annotate a remote URL without the extension (`--playwright`)

Add `--playwright` to a URL request and the CLI drives a headed
[Playwright](https://playwright.dev) browser it controls, injecting the panel
directly (Channel A — CSP-immune, no extension):

```bash
share-the-mark request --playwright https://example.com   # opens a browser you annotate in
```

Annotate the page it opens and click **Send to agent**; the brief flows back
exactly as above (close the window to cancel). This needs Node and Playwright
available — resolved from your project's `node_modules`, the current directory, or
a global install (`npm i -g playwright && playwright install chromium`), never
bundled into the binary. For local files, use the plain `request <path>` (below).

### Annotate a local artifact (no extension)

Point `request` at a local HTML file or directory and the daemon serves it on its
loopback origin with the annotation panel already injected — no extension needed
(SPEC §13.6):

```bash
share-the-mark request ./preview.html     # serves + opens it, blocks for your feedback
```

Draw on the page and click **Send to agent**; the brief posts straight back to the
daemon and the command returns it. Ideal for an agent that just generated an HTML
artifact and wants your design feedback on it. The injected bundle is **baked into
the binary** — an installed `share-the-mark` is self-contained. Building from this
repo, use `mise run cli:build` (it builds the bundle first); override the served
bundle for dev with `--bundle <path>` or `SHARE_THE_MARK_EMBED_BUNDLE`.

## Command reference

```text
share-the-mark setup | request [--playwright] <url-or-path> | pending | list
              | show <id> | serve | start | stop | status | skill install
```

Config via flags or `SHARE_THE_MARK_PORT` / `SHARE_THE_MARK_DIR`.

### Daemon lifecycle

`share-the-mark start` (and `share-the-mark setup`, which starts it for you) runs
the daemon in the background with a generous idle timeout (default 3 h) and shuts
itself down once unused — so a forgotten daemon never lingers as a stray. While
you're actively annotating, the extension's connect view pings the daemon every
couple of seconds, which keeps it warm. Pass `--idle-timeout 0` (or
`SHARE_THE_MARK_IDLE=0`) to run forever, or `share-the-mark stop` to end it.
`share-the-mark serve` is the foreground process `start` spawns — it runs until
Ctrl-C, for debugging or under a process manager. A daemon that `share-the-mark
request` auto-starts uses a shorter 30 min idle. `share-the-mark status` checks if
one is running.
