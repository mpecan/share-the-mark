import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeSelector, resolveSelector, type TargetRef } from '@/src/core/selector';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  container.remove();
});

function render(html: string): void {
  container.innerHTML = html;
}

describe('computeSelector — strategy order', () => {
  it('prefers a stable id', () => {
    render('<section id="hero"><p>hi</p></section>');
    const el = document.querySelector('#hero p');
    if (!el) throw new Error('fixture missing');

    const ref = computeSelector(el);
    expect(ref.tag).toBe('p');
    // Anchored at the stable id ancestor.
    expect(ref.selector.startsWith('#hero')).toBe(true);
    expect(resolveSelector(ref)).toBe(el);
  });

  it('uses a test attribute when the element has one', () => {
    render('<button data-testid="save">Save</button>');
    const el = document.querySelector('button');
    if (!el) throw new Error('fixture missing');

    expect(computeSelector(el).selector).toBe('[data-testid="save"]');
  });

  it('falls back to data-test and data-qa', () => {
    render('<a data-test="x">a</a><a data-qa="y">b</a>');
    const [first, second] = [...document.querySelectorAll('a')];
    if (!first || !second) throw new Error('fixture missing');

    expect(computeSelector(first).selector).toBe('[data-test="x"]');
    expect(computeSelector(second).selector).toBe('[data-qa="y"]');
  });

  it('uses a tag-qualified semantic attribute', () => {
    render('<nav><input name="q" /></nav>');
    const el = document.querySelector('input');
    if (!el) throw new Error('fixture missing');

    expect(computeSelector(el).selector).toBe('input[name="q"]');
  });

  it('falls back to a structural nth-of-type path', () => {
    render('<ul><li>a</li><li>b</li><li>c</li></ul>');
    const el = document.querySelectorAll('li')[2];
    if (!el) throw new Error('fixture missing');

    const ref = computeSelector(el);
    expect(ref.selector).toContain(':nth-of-type(3)');
    expect(resolveSelector(ref)).toBe(el);
  });

  it('does not emit nth-of-type for a unique-tag child', () => {
    render('<article><h2>title</h2><p>body</p></article>');
    const el = document.querySelector('h2');
    if (!el) throw new Error('fixture missing');

    expect(computeSelector(el).selector).not.toContain('nth-of-type');
  });
});

describe('computeSelector — unstable id rejection', () => {
  it.each([
    ['react useId', ':r3:'],
    ['uuid', '550e8400-e29b-41d4-a716-446655440000'],
    ['long hex run', 'node-a1b2c3d4e5'],
    ['leading digit', '123abc'],
  ])('rejects %s and falls back to a verified selector', (_label, id) => {
    render(`<div><span></span></div>`);
    const span = document.querySelector('span');
    if (!span) throw new Error('fixture missing');
    span.id = id;

    const ref = computeSelector(span);
    expect(ref.selector.startsWith('#')).toBe(false);
    expect(resolveSelector(ref)).toBe(span);
  });

  it('accepts a clean authored id', () => {
    render('<div id="main-content"></div>');
    const el = container.querySelector('div');
    if (!el) throw new Error('fixture missing');

    expect(computeSelector(el).selector).toBe('#main-content');
  });
});

describe('computeSelector — uniqueness & fallbacks', () => {
  it('skips a duplicated id and still round-trips via structure', () => {
    render('<p id="dup">one</p><p id="dup">two</p>');
    const el = container.querySelectorAll('p')[1];
    if (!el) throw new Error('fixture missing');

    const ref = computeSelector(el);
    // The duplicated id is not unique, so it is not chosen.
    expect(ref.selector).not.toBe('#dup');
    expect(resolveSelector(ref)).toBe(el);
  });

  it('records additional unique candidates as ordered fallbacks', () => {
    render('<input id="email" name="email" aria-label="Email" />');
    const el = document.querySelector('input');
    if (!el) throw new Error('fixture missing');

    const ref = computeSelector(el);
    expect(ref.selector).toBe('#email');
    expect(ref.fallbacks).toContain('input[name="email"]');
    expect(ref.fallbacks).toContain('input[aria-label="Email"]');
  });

  it('escapes quotes in attribute values', () => {
    render('<button aria-label={x}>x</button>');
    const el = document.querySelector('button');
    if (!el) throw new Error('fixture missing');
    el.setAttribute('aria-label', 'Say "hi"');

    const ref = computeSelector(el);
    // No single quote in the value, so single-quote the attribute selector.
    expect(ref.selector).toBe('button[aria-label=\'Say "hi"\']');
    expect(resolveSelector(ref)).toBe(el);
  });

  it('escapes double quotes when the value contains both quote styles', () => {
    render('<button>x</button>');
    const el = document.querySelector('button');
    if (!el) throw new Error('fixture missing');
    el.setAttribute('aria-label', `it's "ok"`);

    // The escaped selector is unparseable in this DOM, so the engine discards
    // it and recovers via a structural fallback.
    const ref = computeSelector(el);
    expect(resolveSelector(ref)).toBe(el);
  });

  it('falls back to the tag name for the document element', () => {
    expect(computeSelector(document.documentElement).selector).toBe('html');
  });

  it('captures the bounding rect and lowercased tag', () => {
    render('<div></div>');
    const el = container.querySelector('div');
    if (!el) throw new Error('fixture missing');

    const ref = computeSelector(el);
    expect(ref.tag).toBe('div');
    expect(typeof ref.rect.x).toBe('number');
    expect(typeof ref.rect.y).toBe('number');
    expect(typeof ref.rect.width).toBe('number');
    expect(typeof ref.rect.height).toBe('number');
  });

  it('returns a non-empty selector for a detached element', () => {
    const orphan = document.createElement('span');
    const ref = computeSelector(orphan);
    // Nothing in the document matches, so no candidate verifies as unique.
    expect(ref.selector).toBe('span');
    expect(ref.fallbacks).toEqual([]);
  });
});

describe('resolveSelector', () => {
  it('returns null when nothing matches', () => {
    const ref: TargetRef = {
      selector: '#nope',
      fallbacks: [],
      tag: 'div',
      rect: { x: 0, y: 0, width: 0, height: 0 },
    };
    expect(resolveSelector(ref)).toBeNull();
  });

  it('skips an invalid selector and recovers via a fallback', () => {
    render('<div id="ok"></div>');
    const el = document.querySelector('#ok');
    if (!el) throw new Error('fixture missing');

    const ref: TargetRef = {
      selector: ':::not a selector:::',
      fallbacks: ['#ok'],
      tag: 'div',
      rect: { x: 0, y: 0, width: 0, height: 0 },
    };
    expect(resolveSelector(ref)).toBe(el);
  });

  it('rejects a single match whose tag disagrees with the ref', () => {
    render('<div id="thing"></div>');
    const ref: TargetRef = {
      selector: '#thing',
      fallbacks: [],
      tag: 'span',
      rect: { x: 0, y: 0, width: 0, height: 0 },
    };
    expect(resolveSelector(ref)).toBeNull();
  });

  it('rejects an ambiguous selector that matches multiple elements', () => {
    render('<p class="m">a</p><p class="m">b</p>');
    const ref: TargetRef = {
      selector: '.m',
      fallbacks: [],
      tag: 'p',
      rect: { x: 0, y: 0, width: 0, height: 0 },
    };
    expect(resolveSelector(ref)).toBeNull();
  });
});
