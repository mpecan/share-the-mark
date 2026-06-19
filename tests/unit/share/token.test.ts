import { describe, expect, it } from 'vitest';
import { decodeToken, encodeToken, TOKEN_PREFIX } from '@/src/share';
import { buildBrief } from '@/src/core/share';
import type { Annotation, CalloutAnnotation, Changelog } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

function target(selector: string): TargetRef {
  return { selector, fallbacks: [], tag: 'div', rect: { x: 0, y: 0, width: 0, height: 0 } };
}

function callout(id: string): CalloutAnnotation {
  return {
    id,
    kind: 'callout',
    createdAt: 0,
    index: 1,
    anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' },
    offset: { dx: 0, dy: 0 },
    target: target('#x'),
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

describe('share token codec', () => {
  it('round-trips a brief through encode → decode', async () => {
    const brief = buildBrief(changelog([callout('a'), callout('b')]));
    const token = await encodeToken(brief);
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(await decodeToken(token)).toEqual({ ok: true, brief });
  });

  it('tolerates surrounding whitespace from a paste', async () => {
    const token = await encodeToken(buildBrief(changelog([callout('a')])));
    expect(await decodeToken(`\n  ${token}\n`)).toMatchObject({ ok: true });
  });

  it('rejects a string without the magic prefix', async () => {
    expect(await decodeToken('just some text')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects a garbled payload', async () => {
    expect(await decodeToken(`${TOKEN_PREFIX}not-valid-gzip`)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects an over-long token without decoding it', async () => {
    expect(await decodeToken(TOKEN_PREFIX + 'a'.repeat(1_000_001))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});
