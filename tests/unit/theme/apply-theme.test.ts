import { describe, expect, it } from 'vitest';
import { applyDocumentTheme } from '@/src/theme/apply-theme';

describe('applyDocumentTheme', () => {
  it('sets data-theme for an explicit theme and removes it for auto', () => {
    const root = document.createElement('div');
    applyDocumentTheme('light', root);
    expect(root.dataset['theme']).toBe('light');
    applyDocumentTheme('dark', root);
    expect(root.dataset['theme']).toBe('dark');
    applyDocumentTheme('auto', root);
    expect(root.dataset['theme']).toBeUndefined();
  });

  it('defaults to the document element', () => {
    applyDocumentTheme('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    applyDocumentTheme('auto');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
});
