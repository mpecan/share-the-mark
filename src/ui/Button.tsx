import type { ButtonHTMLAttributes, JSX } from 'react';

// The shared button used across the extension pages (popup, options) and the
// in-page panel. Appearance comes from the `.stm-btn` classes in
// src/ui/controls.css (loaded in both the pages and the shadow root); callers
// pass surface-specific layout via `className`. Keeps every text-action button
// visually consistent without each surface re-implementing primary/secondary.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element {
  const classes = `stm-btn stm-btn--${variant}${className ? ` ${className}` : ''}`;
  return <button type={type} className={classes} {...rest} />;
}
