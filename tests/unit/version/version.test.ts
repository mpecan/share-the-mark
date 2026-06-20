import { describe, expect, it } from 'vitest';
import { checkDaemonCompat, compareVersions, parseVersion } from '@/src/core/version';

describe('parseVersion', () => {
  it('parses major.minor.patch, ignoring a v prefix and any suffix', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('v0.2.0')).toEqual({ major: 0, minor: 2, patch: 0 });
    expect(parseVersion(' 1.0.0-beta.1 ')).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  it('returns null for malformed versions', () => {
    expect(parseVersion('1.2')).toBeNull(); // missing patch
    expect(parseVersion('x.2.3')).toBeNull(); // non-numeric major
    expect(parseVersion('1.x.3')).toBeNull(); // non-numeric minor
    expect(parseVersion('')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.1.1', '1.1.2')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns null when either side is unparseable', () => {
    expect(compareVersions('nope', '1.0.0')).toBeNull();
  });
});

describe('checkDaemonCompat', () => {
  const base = { extensionVersion: '1.0.0', minDaemonVersion: '0.1.0' };

  it('is ok when both sides meet the floors', () => {
    expect(
      checkDaemonCompat({ ...base, daemonVersion: '0.2.0', daemonMinExtension: '1.0.0' }),
    ).toEqual({ ok: true });
  });

  it('flags a daemon below the extension floor', () => {
    expect(
      checkDaemonCompat({ ...base, minDaemonVersion: '0.2.0', daemonVersion: '0.1.0' }),
    ).toEqual({ ok: false, reason: 'daemon-too-old', need: '0.2.0' });
  });

  it('flags an extension below the daemon floor', () => {
    expect(
      checkDaemonCompat({ ...base, daemonVersion: '0.2.0', daemonMinExtension: '1.1.0' }),
    ).toEqual({ ok: false, reason: 'extension-too-old', need: '1.1.0' });
  });

  it('fails open: missing or unparseable daemon fields skip the check', () => {
    expect(checkDaemonCompat({ ...base })).toEqual({ ok: true });
    expect(
      checkDaemonCompat({ ...base, daemonVersion: 'weird', daemonMinExtension: 'weird' }),
    ).toEqual({
      ok: true,
    });
  });
});
