import { describe, expect, it } from 'vitest';
import { buildExportPayload, changelogToMarkdown } from '@/src/core/export';
import type { Annotation, CalloutAnnotation, Changelog, PencilAnnotation } from '@/src/core/model';
import type { TargetRef } from '@/src/core/selector';

function target(selector: string): TargetRef {
  return { selector, fallbacks: [], tag: 'div', rect: { x: 0, y: 0, width: 0, height: 0 } };
}

function callout(
  id: string,
  index: number,
  partial: Partial<CalloutAnnotation> = {},
): CalloutAnnotation {
  return { id, kind: 'callout', createdAt: 0, index, anchor: { x: 0, y: 0 }, ...partial };
}

function pencil(
  id: string,
  createdAt: number,
  partial: Partial<PencilAnnotation> = {},
): PencilAnnotation {
  return { id, kind: 'pencil', createdAt, path: [], ...partial };
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

  it('numbers annotations and includes the Element line when anchored', () => {
    const md = changelogToMarkdown(
      changelog([
        callout('a', 1, { note: 'Fix the heading', target: target('#hero h1') }),
        callout('b', 2, { note: 'Remove this', target: target('.cta') }),
      ]),
    );
    expect(md).toContain('1. Fix the heading\n   Element: `#hero h1`');
    expect(md).toContain('2. Remove this\n   Element: `.cta`');
  });

  it('omits the Element line for annotations without a target', () => {
    const md = changelogToMarkdown(changelog([pencil('p', 0, { note: 'freeform' })]));
    expect(md).toContain('1. freeform');
    expect(md).not.toContain('Element:');
  });

  it('falls back to a kind label when the note is missing or blank', () => {
    const md = changelogToMarkdown(changelog([callout('a', 1), pencil('p', 1, { note: '   ' })]));
    expect(md).toContain('1. (callout)');
    expect(md).toContain('2. (pencil)');
  });

  it('orders callouts by index, then non-callouts by creation time', () => {
    const md = changelogToMarkdown(
      changelog([
        pencil('late', 200, { note: 'late pencil' }),
        callout('c2', 2, { note: 'second callout' }),
        pencil('early', 100, { note: 'early pencil' }),
        callout('c1', 1, { note: 'first callout' }),
      ]),
    );
    const order = ['first callout', 'second callout', 'early pencil', 'late pencil'];
    const positions = order.map((label) => md.indexOf(label));
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    expect(md).toContain('1. first callout');
    expect(md).toContain('4. late pencil');
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
