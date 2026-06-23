import type { ThemeMode } from '@/src/storage/settings-defaults';

// Apply the chosen theme to one of the extension's own pages (popup, options) by
// setting `data-theme` on the document element. `auto` removes the attribute so the
// CSS prefers-color-scheme query in entrypoints/theme.css takes over; `light`/`dark`
// force that palette regardless of the OS. (The in-page panel does the equivalent on
// its shadow host via the ChangelogPanel `theme` prop.)
export function applyDocumentTheme(
  theme: ThemeMode,
  root: HTMLElement = document.documentElement,
): void {
  if (theme === 'auto') {
    delete root.dataset['theme'];
  } else {
    root.dataset['theme'] = theme;
  }
}
