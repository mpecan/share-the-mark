import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeSelector, resolveSelector } from '@/src/core/selector';

interface NodeSpec {
  tag: string;
  id: string | undefined;
  testid: string | undefined;
  ariaLabel: string | undefined;
  children: NodeSpec[];
}

const TAGS = ['div', 'span', 'p', 'section', 'article', 'ul', 'li', 'a', 'button'];
// A small pool so ids/attrs collide often — this is what exercises the
// uniqueness check and the structural-path fallback.
const tokenArb = fc.constantFrom('a', 'b', 'c', 'one', 'two', 'box', 'item', 'lead', 'main');

function treeArb(depth: number): fc.Arbitrary<NodeSpec> {
  const children: fc.Arbitrary<NodeSpec[]> =
    depth <= 0 ? fc.constant([]) : fc.array(treeArb(depth - 1), { maxLength: 3 });
  return fc.record({
    tag: fc.constantFrom(...TAGS),
    id: fc.option(tokenArb, { nil: undefined }),
    testid: fc.option(tokenArb, { nil: undefined }),
    ariaLabel: fc.option(tokenArb, { nil: undefined }),
    children,
  });
}

function build(spec: NodeSpec, doc: Document): Element {
  const el = doc.createElement(spec.tag);
  if (spec.id !== undefined) el.id = spec.id;
  if (spec.testid !== undefined) el.dataset['testid'] = spec.testid;
  if (spec.ariaLabel !== undefined) el.setAttribute('aria-label', spec.ariaLabel);
  for (const child of spec.children) el.append(build(child, doc));
  return el;
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  container.remove();
});

describe('selector engine — properties', () => {
  it('the primary selector resolves back to its node and is unique', () => {
    fc.assert(
      fc.property(treeArb(3), (spec) => {
        container.innerHTML = '';
        container.append(build(spec, document));

        for (const node of container.querySelectorAll('*')) {
          const ref = computeSelector(node);
          // Uniqueness of the primary selector.
          expect(document.querySelectorAll(ref.selector)).toHaveLength(1);
          // Round-trip.
          expect(resolveSelector(ref)).toBe(node);
        }
      }),
      { numRuns: 80 },
    );
  });
});
