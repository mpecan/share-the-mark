---
title: share-the-mark
description: Annotate live web pages and export a Markdown changelog plus an annotated screenshot — ready to paste into an AI assistant or a bug report.
template: splash
readme: false
hero:
  tagline: Mark up any live web page, then hand a clean Markdown changelog and an annotated screenshot straight to your AI assistant — or to the share-the-mark CLI your agent is watching.
  image:
    file: ./assets/annotated.png
  actions:
    - text: Get started
      link: ./installation/
      icon: right-arrow
      variant: primary
    - text: View on GitHub
      link: https://github.com/mpecan/share-the-mark
      icon: external
      variant: minimal
---

<img src="/demo-annotate.gif" alt="Drawing numbered callouts on a page and exporting the changelog with share-the-mark" style="width:100%;max-width:840px;border-radius:12px;border:1px solid var(--sl-color-gray-5);margin:1rem 0;" />

## Annotate the live DOM, export agent-ready

- **Five focused tools** — callout, text, arrow, highlight, and element — drawn
  directly over the real page. Marks are content-anchored, so they survive scroll,
  resize, reflow, and re-renders.
- **One-click export** copies a stable Markdown changelog (element selectors + your
  notes) plus an annotated PNG — as a single clipboard item to paste anywhere.
- **Hand off to an agent** via the local `share-the-mark` CLI/daemon, with a Claude
  Code skill included, so a coding agent can act on your visual feedback.
- **Embed without the extension** — drop the `@share-the-mark/embed` widget into a
  dev/staging build, or let the CLI drive a Playwright browser.

Start with [Install the extension](./installation/), then [Usage](./usage/).
