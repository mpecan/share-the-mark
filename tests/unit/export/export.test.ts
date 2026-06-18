import { describe, expect, it } from 'vitest';
import { buildExportPayload, changelogToMarkdown } from '@/src/core/export';
import type { Annotation, CalloutAnnotation, Changelog, TextAnnotation } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

function target(selector: string): TargetRef {
  return { selector, fallbacks: [], tag: 'div', rect: { x: 0, y: 0, width: 0, height: 0 } };
}

function callout(
  id: string,
  index: number,
  partial: Partial<CalloutAnnotation> = {},
): CalloutAnnotation {
  return {
    id,
    kind: 'callout',
    createdAt: 0,
    index,
    anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' },
    offset: { dx: 0, dy: 0 },
    target: target('#default'),
    ...partial,
  };
}

function text(
  id: string,
  createdAt: number,
  partial: Partial<TextAnnotation> = {},
): TextAnnotation {
  return {
    id,
    kind: 'text',
    createdAt,
    anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' },
    offset: { dx: 0, dy: 0 },
    target: target('#default'),
    ...partial,
  };
}

function changelog(annotations: Annotation[]): Changelog {
  return {
    id: 'c',
    url: 'https://example.com/page',
    title: 'Example',
    capturedAt: Date.parse('2026-06-17T00:00:00.000Z'),
    annotations,
  };
}

describe('changelogToMarkdown', () => {
  it('renders the stable header with an ISO-8601 timestamp', () => {
    const md = changelogToMarkdown(changelog([]));
    expect(md).toBe(
      '# Change brief — Example\nSource: https://example.com/page\nCaptured: 2026-06-17T00:00:00.000Z',
    );
  });

  it('numbers annotations and includes the resolved Element line', () => {
    const md = changelogToMarkdown(
      changelog([
        callout('a', 1, { note: 'Fix the heading', target: target('#hero h1') }),
        callout('b', 2, { note: 'Remove this', target: target('.cta') }),
      ]),
    );
    expect(md).toContain('1. Fix the heading\n   Element: `#hero h1`');
    expect(md).toContain('2. Remove this\n   Element: `.cta`');
  });

  it('falls back to a kind label when the note is missing or blank', () => {
    const md = changelogToMarkdown(changelog([callout('a', 1), text('t', 1, { note: '   ' })]));
    expect(md).toContain('1. (callout)');
    expect(md).toContain('2. (text)');
  });

  it('orders callouts by index, then non-callouts by creation time', () => {
    const md = changelogToMarkdown(
      changelog([
        text('late', 200, { note: 'late text' }),
        callout('c2', 2, { note: 'second callout' }),
        text('early', 100, { note: 'early text' }),
        callout('c1', 1, { note: 'first callout' }),
      ]),
    );
    const order = ['first callout', 'second callout', 'early text', 'late text'];
    const positions = order.map((label) => md.indexOf(label));
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    expect(md).toContain('1. first callout');
    expect(md).toContain('4. late text');
  });
});

describe('buildExportPayload', () => {
  it('packages markdown, image, and meta', async () => {
    const image = new Blob(['png'], { type: 'image/png' });
    const payload = await buildExportPayload(changelog([callout('a', 1, { note: 'x' })]), image);

    expect(payload.image).toBe(image);
    expect(payload.meta).toEqual({
      url: 'https://example.com/page',
      title: 'Example',
      capturedAt: Date.parse('2026-06-17T00:00:00.000Z'),
    });
    expect(payload.markdown).toContain('1. x');
  });
});
