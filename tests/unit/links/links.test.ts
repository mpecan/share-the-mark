import { describe, expect, it } from 'vitest';
import { CLI_INSTALL, HUB_URL } from '@/src/core/links';

describe('cross-discovery links', () => {
  it('points the hub at the project home', () => {
    expect(HUB_URL).toBe('https://github.com/mpecan/share-the-mark');
  });

  it('offers labelled CLI install commands that name the package', () => {
    expect(CLI_INSTALL.length).toBeGreaterThan(0);
    for (const { label, command } of CLI_INSTALL) {
      expect(label).not.toBe('');
      expect(command).toContain('share-the-mark');
    }
  });
});
