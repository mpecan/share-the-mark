import { useEffect, useRef, useState } from 'react';

// Shared "Copy" → "Copied" button state, used by every copy-to-clipboard control
// (the Options CLI rows, the panel's agent-setup command). Tracks the last value
// successfully copied — callers with multiple buttons compare `copied === value`
// to light up only the one that was pressed — and resets after `resetMs` so the
// feedback is transient rather than sticky.

export interface UseCopy {
  /** The most recently copied text, or null once the feedback has reset. */
  copied: string | null;
  /** Write `text` to the clipboard; on success, flag it as copied. */
  copy: (text: string) => void;
}

export function useCopy(resetMs = 1500): UseCopy {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  function copy(text: string): void {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(text);
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          setCopied(null);
        }, resetMs);
      } catch {
        // Clipboard may be unavailable on this page; the text stays visible to copy by hand.
      }
    })();
  }

  return { copied, copy };
}
