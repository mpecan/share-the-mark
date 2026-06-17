import TurndownService from 'turndown';

// DOM → Markdown — SPEC §5.5. Pure: Turndown parses the cleaned HTML string
// with its own bundled parser, so this works without a live browser DOM. The
// pre-pass strips page chrome (nav/aside/footer/scripts) before conversion.

export interface MarkdownOptions {
  /** Extra selectors to strip, in addition to the defaults. */
  strip?: string[];
}

const DEFAULT_STRIP = [
  'script',
  'style',
  'noscript',
  'template',
  'nav',
  'aside',
  'footer',
  '[aria-hidden="true"]',
  '[hidden]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
];

function escapeCell(text: string): string {
  return text
    .replaceAll('|', String.raw`\|`)
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function rowCells(row: Element): string[] {
  return [...row.querySelectorAll('th,td')].map((c) => escapeCell(c.textContent));
}

function tableLine(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function convertTable(table: Element): string {
  const [headRow, ...bodyRows] = [...table.querySelectorAll('tr')];
  if (!headRow) return '';

  const header = rowCells(headRow);
  const separator = header.map(() => '---');
  const lines = [
    tableLine(header),
    tableLine(separator),
    ...bodyRows.map((r) => tableLine(rowCells(r))),
  ];
  return `\n\n${lines.join('\n')}\n\n`;
}

function createService(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  // GFM pipe tables — Turndown core leaves tables as inline text otherwise.
  service.addRule('gfmTable', {
    filter: 'table',
    replacement: (_content, node) => convertTable(node),
  });
  return service;
}

function cleanHtml(el: Element, strip: readonly string[]): string {
  const clone = el.cloneNode(true) as Element;
  for (const selector of strip) {
    for (const node of clone.querySelectorAll(selector)) node.remove();
  }
  return clone.outerHTML;
}

export function elementToMarkdown(el: Element, opts: MarkdownOptions = {}): string {
  const strip = [...DEFAULT_STRIP, ...(opts.strip ?? [])];
  return createService().turndown(cleanHtml(el, strip)).trim();
}

export function documentToMarkdown(doc: Document, opts: MarkdownOptions = {}): string {
  return elementToMarkdown(doc.body, opts);
}
