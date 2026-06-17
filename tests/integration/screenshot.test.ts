import { describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { registerCaptureHandler, requestScreenshot } from '@/src/capture';

describe('screenshot capture', () => {
  it('round-trips a capture request to tabs.captureVisibleTab', async () => {
    const dataUrl = 'data:image/png;base64,SGVsbG8=';
    // captureVisibleTab carries a legacy callback overload that confuses the
    // mock's return-type inference; the runtime value is a data URL string.
    const capture = vi.spyOn(browser.tabs, 'captureVisibleTab').mockResolvedValue(dataUrl as never);

    registerCaptureHandler();
    expect(await requestScreenshot()).toBe(dataUrl);
    expect(capture).toHaveBeenCalledTimes(1);

    capture.mockRestore();
  });
});
