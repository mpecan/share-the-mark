// Local-agent connection status (SPEC §5.4, redesign). The agent-setup view polls
// the daemon and renders one of these states; the send is only enabled when
// `connected`. Pure and browser-free — the live `permitted`/`/health` reads happen
// behind the host ports, this only folds their results (plus the version handshake)
// into a single status the panel can render.

import { checkDaemonCompat } from '@/src/core/version';
import { DAEMON_ADDRESS } from '@/src/core/links';

export type AgentConnection =
  /** First read not back yet — the view shows a neutral "checking" state. */
  | { status: 'checking' }
  /** The loopback host permission is off; nothing can reach the daemon. */
  | { status: 'not-permitted' }
  /** Permission granted, but no daemon is answering on the loopback port. */
  | { status: 'disconnected' }
  /** Daemon answered, but a version floor is unmet (either side too old). */
  | { status: 'incompatible'; reason: 'daemon-too-old' | 'extension-too-old'; need: string }
  /** Daemon answered and is compatible — sending is unlocked. */
  | { status: 'connected'; version?: string; address: string };

export interface DaemonReading {
  reachable: boolean;
  version?: string | undefined;
  minExtension?: string | undefined;
}

export interface AgentConnectionInput {
  /** Whether the optional loopback host permission has been granted. */
  permitted: boolean;
  /** The latest `/health` reading, or null if it hasn't been attempted yet. */
  health: DaemonReading | null;
  extensionVersion: string;
  minDaemonVersion: string;
}

/**
 * Fold a permission check + a `/health` reading into a single connection status.
 * Order matters: permission first (a denied fetch never even reaches the daemon),
 * then reachability, then the version handshake (SPEC §11.4) before declaring the
 * link usable.
 */
export function deriveAgentConnection(input: AgentConnectionInput): AgentConnection {
  if (!input.permitted) return { status: 'not-permitted' };
  if (input.health === null) return { status: 'checking' };
  if (!input.health.reachable) return { status: 'disconnected' };
  const compat = checkDaemonCompat({
    extensionVersion: input.extensionVersion,
    minDaemonVersion: input.minDaemonVersion,
    daemonVersion: input.health.version,
    daemonMinExtension: input.health.minExtension,
  });
  if (!compat.ok) return { status: 'incompatible', reason: compat.reason, need: compat.need };
  return input.health.version === undefined
    ? { status: 'connected', address: DAEMON_ADDRESS }
    : { status: 'connected', version: input.health.version, address: DAEMON_ADDRESS };
}
