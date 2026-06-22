import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { init, type WidgetConfig } from '@/src/embed/widget';
import type { ExportPayload } from '@/src/core/export';
import type { StmHandle } from '@/src/embed/mount';
import { fakeCompositeDeps } from '../../fixtures/composite';

// Channel B (SPEC §13.5) — the ShareTheMark.init wrapper. Covered under happy-dom by
// injecting a fake `screenshot` (the real html-to-image capture lives in the
// coverage-excluded screenshot.ts and is exercised by the e2e). A fake compositeDeps
// is passed through `init` via the internal seam so export builds without a real canvas.

let active: StmHandle | null = null;

function config(over: Partial<WidgetConfig> = {}): WidgetConfig {
  return { screenshot: () => Promise.resolve('data:image/png;base64,AAAA'), ...over };
}

// Pass the fake canvas plumbing via init's internal `deps` seam so export builds
// without a real OffscreenCanvas under happy-dom.
function start(over: Partial<WidgetConfig> = {}): StmHandle {
  return init(config(over), { compositeDeps: fakeCompositeDeps() });
}

afterEach(() => {
  active?.destroy();
  active = null;
  document.body.innerHTML = '';
});

describe('ShareTheMark.init', () => {
  it('mounts the widget into a shadow host', async () => {
    await act(async () => {
      active = start();
      await Promise.resolve();
    });
    expect(document.querySelector('[data-stm-embed="true"]')).not.toBeNull();
  });

  it('delivers the export to onSubmit', async () => {
    const onSubmit = vi.fn<(payload: ExportPayload) => Promise<void>>(() => Promise.resolve());
    await act(async () => {
      active = start({ onSubmit });
      await Promise.resolve();
    });
    await act(async () => {
      await active?.exportNow();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload?.markdown).toContain('# Change brief');
    expect(payload?.image).toBeInstanceOf(Blob);
  });

  it('copies the Markdown to the clipboard when no onSubmit is given', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await act(async () => {
      active = start();
      await Promise.resolve();
    });
    await act(async () => {
      await active?.exportNow();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain('# Change brief');
  });

  it('warns and returns the existing widget on a second init', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence the expected warning */
    });
    await act(async () => {
      active = start();
      await Promise.resolve();
    });
    const second = start();
    expect(second).toBe(active);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('removes the host on destroy', async () => {
    await act(async () => {
      active = start();
      await Promise.resolve();
    });
    await act(async () => {
      active?.destroy();
      await Promise.resolve();
    });
    active = null;
    expect(document.querySelector('[data-stm-embed="true"]')).toBeNull();
  });
});
