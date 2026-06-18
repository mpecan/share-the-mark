import * as textPosition from 'dom-anchor-text-position';
import * as textQuote from 'dom-anchor-text-quote';
import type { TextAnchor } from '@/src/core/model';

// Content-based text anchoring (W3C Web Annotation model, Hypothesis-style):
// store redundant selectors and resolve with fallback. A TextPositionSelector
// (character offsets, fast but shift-fragile) is verified against a
// TextQuoteSelector (exact text plus prefix/suffix context, reflow-robust); if
// the position no longer matches, fall back to a fuzzy quote search biased to
// the stored offset (diff-match-patch, via dom-anchor-text-quote).
//
// Offsets and context are relative to a `root` element (the annotation's target
// element), which scopes the search and keeps short anchors — even a one-
// character pin — disambiguated by their surrounding context.

export function describeRange(root: Element, range: Range): TextAnchor {
  const position = textPosition.fromRange(root, range);
  const quote = textQuote.fromRange(root, range);
  return {
    start: position.start,
    end: position.end,
    exact: quote.exact,
    prefix: quote.prefix ?? '',
    suffix: quote.suffix ?? '',
  };
}

export function anchorRange(root: Element, anchor: TextAnchor): Range | null {
  // 1. Position selector, verified against the stored quote.
  try {
    const range = textPosition.toRange(root, { start: anchor.start, end: anchor.end });
    if (range.toString() === anchor.exact) return range;
  } catch {
    // Offsets no longer valid (content shrank) — fall through to fuzzy search.
  }
  // 2. Fuzzy quote search, biased toward the original offset.
  try {
    return textQuote.toRange(
      root,
      { exact: anchor.exact, prefix: anchor.prefix, suffix: anchor.suffix },
      { hint: anchor.start },
    );
  } catch {
    return null;
  }
}
