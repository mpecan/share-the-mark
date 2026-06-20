// Version compatibility between the extension and the local `share-the-mark`
// daemon (SPEC §11.4). The two halves release independently, so compatibility is
// a *declared floor*, not lockstep: each side declares the oldest counterpart it
// works with. Pure and browser-free — the live `/health` read happens in the
// background SW; this only parses and compares.

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

function toInt(part: string | undefined): number | null {
  // Leading digits only, so a pre-release/build suffix on the patch (e.g. the
  // `0` in `0-beta`) still parses.
  const digits = part === undefined ? null : /^\d+/.exec(part);
  return digits === null ? null : Number(digits[0]);
}

/** Parse `major.minor.patch` (ignoring an optional `v` prefix and any suffix). */
export function parseVersion(value: string): SemVer | null {
  const parts = value.trim().replace(/^v/, '').split('.');
  const major = toInt(parts[0]);
  const minor = toInt(parts[1]);
  const patch = toInt(parts[2]);
  if (major === null || minor === null || patch === null) return null;
  return { major, minor, patch };
}

/** -1 / 0 / 1 for a < b / a == b / a > b; null if either is unparseable. */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa === null || pb === null) return null;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}

export type DaemonCompat =
  | { ok: true }
  | { ok: false; reason: 'daemon-too-old' | 'extension-too-old'; need: string };

/**
 * Check the extension ↔ daemon version floors from a `/health` read. `daemonVersion`
 * and `daemonMinExtension` come from the daemon; a missing or unparseable value
 * skips that direction (an older daemon that doesn't declare a floor is assumed
 * compatible — fail open, never block a send on a parse hiccup).
 */
export function checkDaemonCompat(input: {
  extensionVersion: string;
  minDaemonVersion: string;
  daemonVersion?: string | undefined;
  daemonMinExtension?: string | undefined;
}): DaemonCompat {
  const { extensionVersion, minDaemonVersion, daemonVersion, daemonMinExtension } = input;
  if (daemonVersion !== undefined) {
    const cmp = compareVersions(daemonVersion, minDaemonVersion);
    if (cmp !== null && cmp < 0) {
      return { ok: false, reason: 'daemon-too-old', need: minDaemonVersion };
    }
  }
  if (daemonMinExtension !== undefined) {
    const cmp = compareVersions(extensionVersion, daemonMinExtension);
    if (cmp !== null && cmp < 0) {
      return { ok: false, reason: 'extension-too-old', need: daemonMinExtension };
    }
  }
  return { ok: true };
}
