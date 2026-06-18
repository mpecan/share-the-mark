import { describe, expect, it } from 'vitest';
import { onMessage, sendMessage } from '@/src/messaging';

describe('messaging protocol', () => {
  it('round-trips a captureVisibleTab request to its handler', async () => {
    const removeListener = onMessage('captureVisibleTab', () => 'data:image/png;base64,AAAA');
    try {
      expect(await sendMessage('captureVisibleTab', undefined)).toBe('data:image/png;base64,AAAA');
    } finally {
      removeListener();
    }
  });

  it('delivers fire-and-forget activation messages', async () => {
    let isActivated = false;
    const removeListener = onMessage('activateAnnotationMode', () => {
      isActivated = true;
    });
    try {
      await sendMessage('activateAnnotationMode', undefined);
      expect(isActivated).toBe(true);
    } finally {
      removeListener();
    }
  });
});
