/**
 * Smoke-test surface for the pure, browser-free core (SPEC §5). This exists in
 * M0 so the coverage harness has a real `src/core` module to measure against
 * the 100% threshold; it is superseded by the selector engine, annotation
 * model, and Markdown modules in M1.
 */
export function isCoreReady(): boolean {
  return true;
}
