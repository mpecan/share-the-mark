import { describe, expect, it } from 'vitest';
import { isCoreReady } from '@/src/core/health';

describe('isCoreReady', () => {
  it('reports that the pure core is wired', () => {
    expect(isCoreReady()).toBe(true);
  });
});
