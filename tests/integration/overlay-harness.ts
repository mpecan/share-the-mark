import { describeRange } from '@/src/anchor';
import { Overlay, type OverlayOptions } from '@/src/overlay';
import type { Annotation, TextAnchor } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

// Shared fixture + helpers for the overlay integration tests. The mutable
// bindings are reassigned by setupHarness() (called from beforeEach) and read as
// ESM live bindings by the test files.

export const settings = { strokeColor: '#e11d48', strokeWidth: 3, highlightColor: '#fde047' };

export function targetFor(selector: string, tag: string): TargetRef {
  return { selector, fallbacks: [], tag, rect: { x: 0, y: 0, width: 0, height: 0 } };
}

export let container: HTMLElement;
export let para: Element;
export let textNode: Text;
export let created: Annotation[];
export let updated: Annotation[];

export function setupHarness(): void {
  container = document.createElement('div');
  container.innerHTML = '<p id="para">The quick brown fox</p>';
  document.body.append(container);
  const p = container.querySelector('#para');
  if (!p?.firstChild) throw new Error('fixture missing');
  para = p;
  textNode = p.firstChild as Text;
  created = [];
  updated = [];
}

export function teardownHarness(): void {
  container.remove();
}

export function caretAt(offset: number): Range {
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  return range;
}

// A caret that resolves to an element node (not text) — as caretPositionFromPoint
// does over whitespace/padding. expandToChar can't grow it, so callers must
// refuse it rather than build an empty anchor.
export function elementCaret(): Range {
  const range = document.createRange();
  range.setStart(para, 0);
  range.collapse(true);
  return range;
}

export function anchorOver(substring: string): TextAnchor {
  const index = textNode.data.indexOf(substring);
  const range = document.createRange();
  range.setStart(textNode, index);
  range.setEnd(textNode, index + substring.length);
  return describeRange(para, range);
}

export function makeOverlay(overrides: Partial<OverlayOptions> = {}): Overlay {
  let counter = 0;
  return new Overlay({
    container,
    tool: 'callout',
    settings,
    onCreate: (a) => {
      created.push(a);
    },
    onUpdate: (a) => {
      updated.push(a);
    },
    createId: () => `id-${String(++counter)}`,
    now: () => 1000,
    promptText: () => 'typed text',
    caretFromPoint: () => caretAt(4), // the 'q' in "The quick"
    ...overrides,
  });
}

function makeEvent(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
  return event;
}

export function pointer(overlay: Overlay, type: string, x: number, y: number): void {
  overlay.element.dispatchEvent(makeEvent(type, x, y));
}

export function pointerOn(el: Element, type: string, x: number, y: number): void {
  el.dispatchEvent(makeEvent(type, x, y));
}

export function findMark(id: string): Element {
  const mark = container.querySelector(`[data-stm-id="${CSS.escape(id)}"]`);
  if (!mark) throw new Error('mark not found');
  return mark;
}
