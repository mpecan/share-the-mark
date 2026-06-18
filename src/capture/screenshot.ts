import { browser } from 'wxt/browser';
import { onMessage, sendMessage } from '@/src/messaging';

// captureVisibleTab is the only message that must round-trip to the background
// service worker — content scripts cannot call tabs.captureVisibleTab directly
// (SPEC §5.6/§5.8). Returns a PNG data URL.

export function requestScreenshot(): Promise<string> {
  return sendMessage('captureVisibleTab', undefined);
}

export function registerCaptureHandler(): void {
  onMessage('captureVisibleTab', () => browser.tabs.captureVisibleTab());
}
