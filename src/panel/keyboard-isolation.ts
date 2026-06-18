// Keyboard isolation for the in-page UI (SPEC §5.1/§5.8). Our panel/overlay live
// in a closed shadow root, but keyboard events are `composed` — they still
// propagate out to the host page's document/window listeners (retargeted to the
// shadow host, so a site's "is the target an input?" guard misses). Pages with
// single-key shortcuts (e.g. `g`/`h` to navigate) then react to the user typing a
// note, which looks like the extension "reloading".
//
// Stop key events that originate inside our UI from reaching the page. We only
// stop propagation (never preventDefault), so typing in our inputs is unaffected;
// and the listener only fires for events targeting our UI, so the page's own
// shortcuts keep working when focus is on the page.

const KEY_EVENTS = ['keydown', 'keyup', 'keypress'] as const;

function stop(event: Event): void {
  event.stopPropagation();
}

/** Contain key events within `root`. Returns a cleanup function. */
export function isolateKeyboard(root: EventTarget): () => void {
  for (const type of KEY_EVENTS) root.addEventListener(type, stop);
  return () => {
    for (const type of KEY_EVENTS) root.removeEventListener(type, stop);
  };
}
