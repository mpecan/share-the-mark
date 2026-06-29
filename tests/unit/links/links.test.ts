import { describe, expect, it } from 'vitest';
import {
  CHROME_STORE_URL,
  CLI_INSTALL,
  FIREFOX_STORE_URL,
  HUB_URL,
  STORE_LINKS,
} from '@/src/core/links';

describe('cross-discovery links', () => {
  it('points the hub at the project home', () => {
    expect(HUB_URL).toBe('https://github.com/mpecan/share-the-mark');
  });

  it('points each store link at its published listing', () => {
    expect(CHROME_STORE_URL).toContain('chromewebstore.google.com');
    expect(FIREFOX_STORE_URL).toContain('addons.mozilla.org');
    expect(STORE_LINKS.map(({ url }) => url)).toEqual([CHROME_STORE_URL, FIREFOX_STORE_URL]);
    for (const { label } of STORE_LINKS) expect(label).not.toBe('');
  });

  it('offers labelled CLI install commands that name the package', () => {
    expect(CLI_INSTALL.length).toBeGreaterThan(0);
    for (const { label, command } of CLI_INSTALL) {
      expect(label).not.toBe('');
      expect(command).toContain('share-the-mark');
    }
  });
});
