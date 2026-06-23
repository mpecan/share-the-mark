import { describe, expect, it } from 'vitest';
import { deriveAgentConnection } from '@/src/core/agent';
import { DAEMON_ADDRESS } from '@/src/core/links';

// Pure folding of permission + /health + the version handshake into one status
// (SPEC §5.4 redesign). Every branch is exercised here so the agent-setup view's
// gating logic stays under the §8.4 core-coverage bar.
const base = { extensionVersion: '1.0.0', minDaemonVersion: '0.1.0' } as const;

describe('deriveAgentConnection', () => {
  it('is not-permitted when the loopback permission is off', () => {
    expect(
      deriveAgentConnection({ ...base, permitted: false, health: { reachable: true } }),
    ).toEqual({ status: 'not-permitted' });
  });

  it('is checking before the first health read returns', () => {
    expect(deriveAgentConnection({ ...base, permitted: true, health: null })).toEqual({
      status: 'checking',
    });
  });

  it('is disconnected when permitted but no daemon answers', () => {
    expect(
      deriveAgentConnection({ ...base, permitted: true, health: { reachable: false } }),
    ).toEqual({ status: 'disconnected' });
  });

  it('is incompatible when the daemon is below the floor', () => {
    expect(
      deriveAgentConnection({
        ...base,
        permitted: true,
        health: { reachable: true, version: '0.0.1' },
      }),
    ).toEqual({ status: 'incompatible', reason: 'daemon-too-old', need: '0.1.0' });
  });

  it('is incompatible when the extension is below the daemon floor', () => {
    expect(
      deriveAgentConnection({
        ...base,
        permitted: true,
        health: { reachable: true, version: '9.9.9', minExtension: '99.0.0' },
      }),
    ).toEqual({ status: 'incompatible', reason: 'extension-too-old', need: '99.0.0' });
  });

  it('is connected with the reported version and the daemon address', () => {
    expect(
      deriveAgentConnection({
        ...base,
        permitted: true,
        health: { reachable: true, version: '9.9.9' },
      }),
    ).toEqual({ status: 'connected', version: '9.9.9', address: DAEMON_ADDRESS });
  });

  it('is connected without a version when the daemon does not report one', () => {
    expect(
      deriveAgentConnection({ ...base, permitted: true, health: { reachable: true } }),
    ).toEqual({ status: 'connected', address: DAEMON_ADDRESS });
  });
});
