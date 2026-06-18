import { afterEach, describe, expect, it, vi } from 'vitest';
import { isolateKeyboard } from '@/src/panel/keyboard-isolation';

// Simulates the host page (an ancestor with a global key shortcut) containing our
// shadow-root UI (`root`) with a focused input (`field`).
function setup() {
  const page = document.createElement('div');
  const root = document.createElement('div');
  const field = document.createElement('input');
  root.append(field);
  page.append(root);
  document.body.append(page);
  return { page, root, field };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('isolateKeyboard', () => {
  it('stops UI key events from reaching the page, and cleanup restores them', () => {
    const { page, root, field } = setup();
    const pageShortcut = vi.fn();
    page.addEventListener('keydown', pageShortcut);

    const release = isolateKeyboard(root);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    expect(pageShortcut).not.toHaveBeenCalled();

    release();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    expect(pageShortcut).toHaveBeenCalledTimes(1);
  });

  it('does not preventDefault (typing still works)', () => {
    const { root, field } = setup();
    isolateKeyboard(root);
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    field.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('covers keyup and keypress too', () => {
    const { page, root, field } = setup();
    const onKeyup = vi.fn();
    const onKeypress = vi.fn();
    page.addEventListener('keyup', onKeyup);
    page.addEventListener('keypress', onKeypress);

    isolateKeyboard(root);
    field.dispatchEvent(new KeyboardEvent('keyup', { key: 'g', bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keypress', { key: 'g', bubbles: true }));
    expect(onKeyup).not.toHaveBeenCalled();
    expect(onKeypress).not.toHaveBeenCalled();
  });

  it('leaves page-originated key events alone', () => {
    const { page } = setup();
    const pageShortcut = vi.fn();
    page.addEventListener('keydown', pageShortcut);
    isolateKeyboard(document.createElement('div')); // our UI isn't in this event's path
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    expect(pageShortcut).toHaveBeenCalledTimes(1);
  });
});
