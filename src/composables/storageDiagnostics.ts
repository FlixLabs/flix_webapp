import type { StorageLocation } from './useStorageLocations';

const issues = {
  STORAGE_UNAVAILABLE: ['Volume inaccessible', 'Check the volume mount and permissions on the storage host.'],
  PATH_NOT_FOUND: ['Storage path missing', 'Check the configured host path and the agent bind mount.'],
  PERMISSION_DENIED: ['Storage access denied', 'Check host permissions for the agent user.'],
  IO_ERROR: ['Filesystem I/O error', 'Check the host filesystem and mount. If the host can read it, recreate the agent to refresh its mounts.'],
  MOUNT_DISCONNECTED: ['Mount disconnected', 'Restore the host mount, then recreate the agent if its mount is still unavailable.'],
  STALE_MOUNT: ['Mount is stale', 'Check the host mount, then recreate the agent to refresh its mounts.'],
  NOT_DIRECTORY: ['Storage path is not a directory', 'Check the configured path and bind mount.'],
  INVALID_METRICS: ['Measurements invalid', 'The filesystem returned inconsistent capacity measurements.'],
  MOUNT_NOT_FOUND: ['Mount information missing', 'Check the agent mounts and Linux mount information.'],
  MEASUREMENT_MISSING: ['Measurement missing', 'The service did not report usable measurements for this location.'],
  CAPACITY_UNCONFIRMED: ['Capacity not confirmed', 'The total capacity cannot be matched to this filesystem. An agent can measure it directly.'],
} as const;
export type StorageIssue = keyof typeof issues;
export function normalizeStorageIssue(value: unknown): StorageIssue {
  return typeof value === 'string' && Object.hasOwn(issues, value) ? value as StorageIssue : 'STORAGE_UNAVAILABLE';
}
export function storageDiagnostic(location: StorageLocation, threshold: number) {
  if (location.accessible && location.free === 0) return { state: 'full', color: 'error', message: 'Storage full', hint: 'No usable space remains. Free space before requesting more downloads.' };
  const code = location.issue ?? (!location.accessible ? 'STORAGE_UNAVAILABLE' : undefined);
  if (code) {
    const measurement = ['MEASUREMENT_MISSING', 'INVALID_METRICS', 'MOUNT_NOT_FOUND', 'CAPACITY_UNCONFIRMED'].includes(code);
    return { state: measurement ? 'missing' : 'inaccessible', color: measurement ? 'warning' : 'error',
      message: issues[code][0], hint: issues[code][1] };
  }
  if (location.free === null || location.total === null || location.ratio === null) {
    return { state: 'missing', color: 'warning', message: 'Measurement missing', hint: 'Capacity measurements are incomplete; usage cannot be confirmed.' };
  }
  if (Number.isFinite(threshold) && threshold >= 0 && threshold <= 100 && location.ratio >= threshold) {
    return { state: 'saturated', color: 'warning', message: 'Storage nearly full', hint: `${Math.ceil(location.ratio)}% used; alert threshold is ${threshold}%. Free space or move media.` };
  }
  return { state: 'available', color: 'success', message: 'Available', hint: '' };
}

export function storageRequestError(code: unknown, status?: number) {
  const messages: Record<string, string> = {
    INSTANCE_NOT_FOUND: 'The selected instance no longer exists. Reload the instance list.',
    INSTANCE_DATA_UNAVAILABLE: 'Flix API cannot load the instance configuration. Check its connection to Redis.',
    AGENT_NOT_CONFIGURED: 'No storage agent configured for this instance.',
    AGENT_CONFIG_INVALID: 'The storage agent URL is invalid. Check the instance configuration.',
    AGENT_AUTH_FAILED: 'The storage agent rejected authentication. Check the configured agent token.',
    AGENT_ENDPOINT_NOT_FOUND: 'The storage agent endpoint was not found. Check its URL and deployment.',
    AGENT_MEASUREMENT_FAILED: 'The agent is reachable but cannot collect filesystem measurements. Check its mounts.',
    AGENT_RESPONSE_INVALID: 'The agent returned invalid measurements. Check the API and agent versions.',
    AGENT_TIMEOUT: 'The storage agent did not respond in time. Check its network and availability.',
    AGENT_UNREACHABLE: 'Flix API cannot reach the storage agent. Check its container and network.',
  };
  if (typeof code === 'string' && Object.hasOwn(messages, code)) return messages[code]!;
  if (status === 401 || status === 403) return `Storage request access denied (HTTP ${status}).`;
  if (status === 404) return 'Storage instance or agent configuration not found (HTTP 404).';
  if (status === 502) return messages.AGENT_UNREACHABLE!;
  return 'Storage measurements could not be loaded. Check Flix API and the network.';
}
