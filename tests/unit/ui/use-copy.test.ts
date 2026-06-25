import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCopy } from '@/src/ui/use-copy';

function mockClipboard(writeText: () => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('useCopy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags the copied value, then resets after the timeout', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);

    const { result } = renderHook(() => useCopy(1500));
    expect(result.current.copied).toBeNull();

    await act(async () => {
      result.current.copy('hello');
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.current.copied).toBe('hello');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.copied).toBeNull();
  });

  it('keeps the latest value when copying twice and restarts the timer', async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    const { result } = renderHook(() => useCopy(1000));

    await act(async () => {
      result.current.copy('a');
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    await act(async () => {
      result.current.copy('b');
      await Promise.resolve();
    });
    expect(result.current.copied).toBe('b');

    // The first timer would have fired at 1000ms total; ensure it didn't clear 'b'.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.copied).toBe('b');
  });

  it('stays null when the clipboard write rejects', async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const { result } = renderHook(() => useCopy());

    await act(async () => {
      result.current.copy('x');
      await Promise.resolve();
    });
    expect(result.current.copied).toBeNull();
  });

  it('clears the pending timer on unmount', async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() => useCopy());

    await act(async () => {
      result.current.copy('x');
      await Promise.resolve();
    });
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
