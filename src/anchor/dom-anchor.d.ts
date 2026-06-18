// Minimal type declarations for the Hypothesis dom-anchor primitives, which
// ship as untyped CommonJS. We only use fromRange/toRange.

declare module 'dom-anchor-text-position' {
  export interface TextPositionSelector {
    start: number;
    end: number;
  }
  export function fromRange(root: Node, range: Range): TextPositionSelector;
  export function toRange(root: Node, selector: TextPositionSelector): Range;
}

declare module 'dom-anchor-text-quote' {
  export interface TextQuoteSelector {
    exact: string;
    prefix?: string;
    suffix?: string;
  }
  export function fromRange(root: Node, range: Range): TextQuoteSelector;
  export function toRange(
    root: Node,
    selector: TextQuoteSelector,
    options?: { hint?: number },
  ): Range | null;
}
