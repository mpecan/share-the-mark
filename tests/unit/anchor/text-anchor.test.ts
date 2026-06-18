import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anchorRange, describeRange } from '@/src/anchor';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.innerHTML = '<p>The quick brown fox jumps over the lazy dog.</p>';
  document.body.append(root);
});

afterEach(() => {
  root.remove();
});

function rangeOver(substring: string): Range {
  const node = root.querySelector('p')?.firstChild;
  if (!node) throw new Error('fixture missing');
  const text = node as Text;
  const index = text.data.indexOf(substring);
  const range = document.createRange();
  range.setStart(text, index);
  range.setEnd(text, index + substring.length);
  return range;
}

describe('text anchoring', () => {
  it('round-trips a range through describe/anchor', () => {
    const anchor = describeRange(root, rangeOver('brown'));
    expect(anchor.exact).toBe('brown');
    const resolved = anchorRange(root, anchor);
    expect(resolved?.toString()).toBe('brown');
  });

  it('recovers via the fuzzy quote search after offsets shift', () => {
    const anchor = describeRange(root, rangeOver('brown'));
    // Insert text far from the anchor — the stored position offsets are now
    // wrong, but the quote + context still resolves.
    const p = root.querySelector('p');
    if (!p) throw new Error('fixture missing');
    p.textContent = `Prepended sentence. ${p.textContent}`;

    const resolved = anchorRange(root, anchor);
    expect(resolved?.toString()).toBe('brown');
  });

  it('returns null when the quoted text is gone', () => {
    const anchor = describeRange(root, rangeOver('brown'));
    const p = root.querySelector('p');
    if (!p) throw new Error('fixture missing');
    p.textContent = 'Completely different content with no match.';

    expect(anchorRange(root, anchor)).toBeNull();
  });
});
