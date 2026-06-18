import { describe, expect, it } from 'vitest';
import { documentToMarkdown, elementToMarkdown } from '@/src/core/markdown';

function fragment(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

describe('elementToMarkdown', () => {
  it('emits ATX headings', () => {
    const md = elementToMarkdown(fragment('<h1>Title</h1><h2>Sub</h2>'));
    expect(md).toContain('# Title');
    expect(md).toContain('## Sub');
  });

  it('emits fenced code blocks', () => {
    const md = elementToMarkdown(fragment('<pre><code>const x = 1;</code></pre>'));
    expect(md).toContain('```');
    expect(md).toContain('const x = 1;');
  });

  it('preserves inline formatting and links', () => {
    const md = elementToMarkdown(
      fragment('<p>A <strong>b</strong> and <em>c</em> with <a href="https://x">link</a></p>'),
    );
    expect(md).toContain('**b**');
    expect(md).toContain('*c*');
    expect(md).toContain('[link](https://x)');
  });

  it('renders tables as GFM pipe tables', () => {
    const md = elementToMarkdown(
      fragment(
        '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
          '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
      ),
    );
    expect(md).toContain('| A | B |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 1 | 2 |');
  });

  it('escapes pipes inside table cells', () => {
    const md = elementToMarkdown(
      fragment('<table><tr><th>H</th></tr><tr><td>a|b</td></tr></table>'),
    );
    expect(md).toContain(String.raw`| a\|b |`);
  });

  it('returns empty string for a table with no rows', () => {
    expect(elementToMarkdown(fragment('<table></table>'))).toBe('');
  });

  it('strips page chrome by default', () => {
    const md = elementToMarkdown(
      fragment(
        '<nav>menu</nav><aside>side</aside><p>keep</p><footer>foot</footer><script>boom</script>',
      ),
    );
    expect(md).toContain('keep');
    expect(md).not.toContain('menu');
    expect(md).not.toContain('side');
    expect(md).not.toContain('foot');
    expect(md).not.toContain('boom');
  });

  it('accepts extra strip selectors', () => {
    const md = elementToMarkdown(fragment('<div class="ad">promo</div><p>keep</p>'), {
      strip: ['.ad'],
    });
    expect(md).toContain('keep');
    expect(md).not.toContain('promo');
  });
});

describe('documentToMarkdown', () => {
  it('converts the document body', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML = '<h1>Page</h1><p>Body text</p>';
    const md = documentToMarkdown(doc);
    expect(md).toContain('# Page');
    expect(md).toContain('Body text');
  });
});
