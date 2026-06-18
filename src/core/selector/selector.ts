// CSS selector engine — SPEC §5.2. Pure, browser-API-free beyond the standard
// DOM (`Element`/`Document`) the host page already provides. The goal is a
// primary selector that is verified to match exactly one element, plus an
// ordered list of fallbacks so `resolveSelector` can recover the node even if
// the page mutates slightly.

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetRef {
  /** Primary, verified-unique selector. */
  selector: string;
  /** Ordered alternative strategies, each also verified unique at compute time. */
  fallbacks: string[];
  /** Lowercased tagName, used as a sanity check on resolve. */
  tag: string;
  rect: TargetRect;
}

// Reject ids that are clearly framework-generated rather than authored.
const REACT_USE_ID = /^:r[\da-z]+:$/i;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const LONG_HEX_RUN = /[\da-f]{8,}/i;
// A plain, unescaped CSS identifier we can safely drop into `#id`.
const SIMPLE_TOKEN = /^[a-z][\w-]*$/i;

// Semantic attributes worth trying (tag-qualified) before falling back to a
// structural path. Order is priority order.
const SEMANTIC_ATTRS = ['aria-label', 'name', 'role', 'placeholder', 'title', 'alt'] as const;
const TEST_ATTRS = ['data-testid', 'data-test', 'data-qa'] as const;

function isStableId(id: string): boolean {
  // Check the framework-generated shapes first, then general validity, then
  // long hex runs (auto-generated suffixes) — each pattern is the one that
  // rejects its own kind of id.
  if (REACT_USE_ID.test(id)) return false;
  if (UUID.test(id)) return false;
  if (!SIMPLE_TOKEN.test(id)) return false;
  if (LONG_HEX_RUN.test(id)) return false;
  return true;
}

function attrSelector(name: string, value: string): string {
  if (!value.includes('"')) return `[${name}="${value}"]`;
  if (!value.includes("'")) return `[${name}='${value}']`;
  // Value contains both quote styles — escape backslashes and double quotes.
  // eslint-disable-next-line unicorn/prefer-string-raw -- explicit escapes read clearer here than String.raw
  const escaped = value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return `[${name}="${escaped}"]`;
}

function isUniqueMatch(selector: string, el: Element, root: ParentNode): boolean {
  let nodes: NodeListOf<Element>;
  try {
    nodes = root.querySelectorAll(selector);
  } catch {
    // A value carrying both quote styles can produce a selector the engine
    // can't parse; treat it as a non-match and let a fallback win.
    return false;
  }
  return nodes.length === 1 && nodes.item(0) === el;
}

// Build a `:nth-of-type()` child-combinator path, anchored at the nearest
// ancestor carrying a stable id (or the document element).
function structuralPath(el: Element, root: Document): string {
  const parts: string[] = [];
  let node: Element = el;

  while (node !== root.documentElement) {
    const tag = node.tagName.toLowerCase();

    // Anchor at an id only when it is both authored-looking and actually
    // unique — a duplicated id is worse than a structural path.
    if (node.id && isStableId(node.id) && isUniqueMatch(`#${node.id}`, node, root)) {
      parts.unshift(`#${node.id}`);
      return parts.join(' > ');
    }

    const parent = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
    parts.unshift(
      sameTag.length === 1 ? tag : `${tag}:nth-of-type(${String(sameTag.indexOf(node) + 1)})`,
    );
    node = parent;
  }

  return parts.join(' > ');
}

function candidateSelectors(el: Element, tag: string, path: string): string[] {
  const candidates: string[] = [];

  if (el.id && isStableId(el.id)) candidates.push(`#${el.id}`);

  for (const attr of TEST_ATTRS) {
    const value = el.getAttribute(attr);
    if (value !== null && value !== '') candidates.push(attrSelector(attr, value));
  }

  for (const attr of SEMANTIC_ATTRS) {
    const value = el.getAttribute(attr);
    if (value !== null && value !== '') candidates.push(`${tag}${attrSelector(attr, value)}`);
  }

  if (path !== '') candidates.push(path);

  // De-duplicate while preserving priority order.
  return [...new Set(candidates)];
}

export function computeSelector(el: Element, root?: Document): TargetRef {
  const doc = root ?? el.ownerDocument;
  const tag = el.tagName.toLowerCase();
  const path = structuralPath(el, doc);

  const verified = candidateSelectors(el, tag, path).filter((c) => isUniqueMatch(c, el, doc));

  const [primary, ...rest] = verified;
  const selector = primary ?? (path === '' ? tag : path);
  const fallbacks = primary === undefined ? [] : rest;

  const domRect = el.getBoundingClientRect();
  const rect: TargetRect = {
    x: domRect.x,
    y: domRect.y,
    width: domRect.width,
    height: domRect.height,
  };

  return { selector, fallbacks, tag, rect };
}

export function resolveSelector(ref: TargetRef, root?: Document): Element | null {
  const doc = root ?? document;

  for (const selector of [ref.selector, ...ref.fallbacks]) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = doc.querySelectorAll(selector);
    } catch {
      continue;
    }
    if (nodes.length === 1) {
      const found = nodes.item(0);
      if (found.tagName.toLowerCase() === ref.tag) return found;
    }
  }

  return null;
}
