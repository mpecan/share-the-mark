import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildBrief, isSameTarget, validateBrief, SHARE_VERSION } from '@/src/core/share';
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

function changelog(annotations: Annotation[]): Changelog {
  return {
    id: 'c',
    url: 'https://example.com/page',
    title: 'Example',
    capturedAt: 42,
    annotations,
  };
}

// A deep copy, standing in for a value that has crossed the transport boundary.
function roundTrip(value: unknown): unknown {
  return structuredClone(value);
}

describe('buildBrief', () => {
  it('captures the changelog content (minus id) and stamps the version', () => {
    const brief = buildBrief(changelog([callout('a')]));
    expect(brief).toMatchObject({
      v: SHARE_VERSION,
      url: 'https://example.com/page',
      title: 'Example',
      capturedAt: 42,
    });
    expect(brief.annotations).toHaveLength(1);
    expect(typeof brief.fingerprint).toBe('string');
    expect('id' in brief).toBe(false);
  });
});

describe('validateBrief', () => {
  it('accepts a freshly built brief after a JSON round-trip', () => {
    const brief = buildBrief(changelog([callout('a'), callout('b')]));
    const result = validateBrief(roundTrip(brief));
    expect(result).toEqual({ ok: true, brief });
  });

  it('rejects non-objects and missing fields as malformed', () => {
    for (const bad of [null, 42, 'x', []]) {
      expect(validateBrief(bad)).toEqual({ ok: false, reason: 'malformed' });
    }
    const brief = buildBrief(changelog([callout('a')]));
    expect(validateBrief({ ...brief, title: 123 })).toEqual({ ok: false, reason: 'malformed' });
    expect(validateBrief({ ...brief, capturedAt: 'soon' })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(validateBrief({ ...brief, fingerprint: 1 })).toEqual({ ok: false, reason: 'malformed' });
    expect(validateBrief({ ...brief, annotations: 'nope' })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects an unknown version', () => {
    const brief = buildBrief(changelog([callout('a')]));
    expect(validateBrief({ ...brief, v: 2 })).toEqual({ ok: false, reason: 'version' });
  });

  it('rejects non-http(s) and unparseable URLs', () => {
    const brief = buildBrief(changelog([callout('a')]));
    expect(validateBrief({ ...brief, url: 'ftp://example.com' })).toEqual({
      ok: false,
      reason: 'url',
    });
    expect(validateBrief({ ...brief, url: ':::not a url' })).toEqual({ ok: false, reason: 'url' });
  });

  it('rejects oversized and malformed annotation arrays', () => {
    const brief = buildBrief(changelog([callout('a')]));
    expect(
      validateBrief({ ...brief, annotations: Array.from({ length: 1001 }, () => callout('a')) }),
    ).toMatchObject({ ok: false, reason: 'too-large' });
    for (const bad of [
      null,
      { id: 1 },
      { id: 'a', kind: 2 },
      { id: 'a', kind: 'callout' },
      { id: 'a', kind: 'callout', target: null },
    ]) {
      expect(validateBrief({ ...brief, annotations: [bad] })).toEqual({
        ok: false,
        reason: 'malformed',
      });
    }
  });

  it('rejects a tampered payload via the integrity fingerprint', () => {
    const brief = buildBrief(changelog([callout('a')]));
    // Valid shape, but a field changed after the fingerprint was computed.
    expect(validateBrief({ ...brief, title: 'Tampered' })).toEqual({
      ok: false,
      reason: 'integrity',
    });
  });

  it('round-trips arbitrary content fields (property)', () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.string(), fc.integer({ min: 0 }), (url, title, capturedAt) => {
        const brief = buildBrief({ id: 'c', url, title, capturedAt, annotations: [callout('a')] });
        expect(validateBrief(roundTrip(brief))).toEqual({ ok: true, brief });
      }),
      { numRuns: 50 },
    );
  });
});

describe('isSameTarget', () => {
  it('matches host + path + query, ignoring scheme, hash, and a trailing slash', () => {
    expect(isSameTarget('https://x.com/a', 'https://x.com/a')).toBe(true);
    expect(isSameTarget('https://x.com/a/', 'https://x.com/a')).toBe(true);
    expect(isSameTarget('https://x.com/a#top', 'https://x.com/a#bottom')).toBe(true);
    expect(isSameTarget('https://x.com/a?q=1', 'https://x.com/a?q=2')).toBe(false);
    expect(isSameTarget('https://x.com/a', 'https://x.com/b')).toBe(false);
    expect(isSameTarget('not a url', 'https://x.com/a')).toBe(false);
  });
});
