import { describe, expect, it } from 'vitest';
import { claimPendingImport, summarizePlacement, type PendingImport } from '@/src/share';
import { buildBrief } from '@/src/core/share';
import type { Annotation, CalloutAnnotation, Changelog } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

function target(selector: string): TargetRef {
  return { selector, fallbacks: [], tag: 'div', rect: { x: 0, y: 0, width: 0, height: 0 } };
}

function callout(id: string, partial: Partial<CalloutAnnotation> = {}): CalloutAnnotation {
  return {
    id,
    kind: 'callout',
    createdAt: 0,
    index: 1,
    anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' },
    offset: { dx: 0, dy: 0 },
    target: target('#x'),
    ...partial,
  };
}

function changelog(url: string, annotations: Annotation[]): Changelog {
  return { id: 'c', url, title: 'Example', capturedAt: 42, annotations };
}

function pending(url: string, createdAt: number): PendingImport {
  return { brief: buildBrief(changelog(url, [callout('a')])), createdAt };
}

// A fake resolver: every mark places except the one with id 'b'.
const resolveExceptB = (annotation: Annotation): unknown => (annotation.id === 'b' ? null : {});

describe('claimPendingImport', () => {
  const href = 'https://example.com/page';

  it('returns null when there is no pending import', () => {
    expect(claimPendingImport({ pending: null, href, now: 1000 })).toBeNull();
  });

  it('returns null for a stale slot', () => {
    const stale = pending(href, 0);
    expect(claimPendingImport({ pending: stale, href, now: 3 * 60 * 1000 })).toBeNull();
  });

  it('returns null when the tab landed on a different page', () => {
    const slot = pending('https://example.com/other', 1000);
    expect(claimPendingImport({ pending: slot, href, now: 1000 })).toBeNull();
  });

  it('returns the brief for a fresh, matching slot', () => {
    const slot = pending(href, 1000);
    expect(claimPendingImport({ pending: slot, href, now: 1500 })).toBe(slot.brief);
  });
});

describe('summarizePlacement', () => {
  it('counts placed vs orphaned marks and labels the orphans', () => {
    const annotations = [callout('a', { note: 'keep me' }), callout('b')];
    expect(summarizePlacement(annotations, document, resolveExceptB)).toEqual({
      placed: 1,
      total: 2,
      orphans: [{ id: 'b', label: '(callout)' }],
    });
  });

  it('uses the live resolver by default', () => {
    expect(summarizePlacement([callout('a')], document).total).toBe(1);
  });
});
