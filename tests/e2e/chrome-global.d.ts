// Ambient `chrome` typing for code evaluated inside the MV3 service worker during
// e2e (the worker.evaluate callbacks run in the extension, not the test runtime).
// Script-mode .d.ts (no imports/exports) so it applies globally without importing.
// eslint-disable-next-line no-var -- ambient globals are declared with `var`.
declare var chrome: {
  tabs: {
    query: (q: { active: boolean; currentWindow: boolean }) => Promise<{ id?: number }[]>;
    sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
  };
  scripting: {
    executeScript: (injection: { target: { tabId: number }; files: string[] }) => Promise<unknown>;
  };
};
