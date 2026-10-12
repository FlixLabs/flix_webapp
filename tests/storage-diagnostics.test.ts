import { expect, it } from 'vitest';
import { storageDiagnostic, storageRequestError, normalizeStorageIssue } from '@/composables/storageDiagnostics';
import type { StorageLocation } from '@/composables/useStorageLocations';

const healthy: StorageLocation = { path: '/storage/movies', accessible: true, free: 20, total: 100, ratio: 80 };
it('distinguishes saturation from inaccessible volumes and missing measurements', () => {
  expect(storageDiagnostic(healthy, 90).state).toBe('available');
  expect(storageDiagnostic({ ...healthy, ratio: 98 }, 90).state).toBe('saturated');
  expect(storageDiagnostic({ ...healthy, accessible: false, free: null, total: null, ratio: null, issue: 'IO_ERROR' }, 90)).toMatchObject({ state: 'inaccessible', message: 'Filesystem I/O error' });
  expect(storageDiagnostic({ ...healthy, free: null, total: null, ratio: null, issue: 'MEASUREMENT_MISSING' }, 90).state).toBe('missing');
});
it('never interprets an inaccessible or unmeasured volume as a full disk', () => {
  expect(storageDiagnostic({ ...healthy, accessible: false, free: 0, issue: 'STORAGE_UNAVAILABLE' }, 90).state).toBe('inaccessible');
  expect(storageDiagnostic({ ...healthy, free: null, total: null, ratio: null }, 90).state).toBe('missing');
  expect(storageDiagnostic({ ...healthy, free: 0, total: null, ratio: null, issue: 'CAPACITY_UNCONFIRMED' }, 90).state).toBe('full');
});
it.each(['PERMISSION_DENIED', 'PATH_NOT_FOUND', 'IO_ERROR', 'MOUNT_DISCONNECTED', 'STALE_MOUNT', 'INVALID_METRICS'] as const)(
  'provides a controlled diagnostic and recovery hint for %s', code => {
    const diagnosis = storageDiagnostic({ ...healthy, accessible: false, issue: code }, 90);
    expect(diagnosis.hint.length).toBeGreaterThan(0);
    expect(diagnosis.state).not.toBe('available');
  },
);
it('ignores unknown or malicious error codes', () => {
  expect(normalizeStorageIssue('secret password')).toBe('STORAGE_UNAVAILABLE');
  expect(normalizeStorageIssue('__proto__')).toBe('STORAGE_UNAVAILABLE');
  expect(storageRequestError('secret password', 502)).not.toContain('secret');
  expect(storageRequestError('AGENT_AUTH_FAILED', 502)).toContain('token');
  expect(storageRequestError('AGENT_MEASUREMENT_FAILED', 502)).toContain('reachable');
});
it('does not generate saturation alerts from invalid thresholds', () => {
  expect(storageDiagnostic(healthy, NaN).state).toBe('available');
  expect(storageDiagnostic(healthy, 101).state).toBe('available');
});
