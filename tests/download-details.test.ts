import { describe, expect, it } from 'vitest';
import { downloadDetails } from '@/composables/useDownloadDetails';
describe('download details', () => {
  it('calculates progress from known sizes and preserves reported time', () => {
    expect(downloadDetails({ size: 100, sizeleft: 25, timeleft: '00:05:00' })).toMatchObject({ ratio: 75, remaining: 25, timeLeft: '00:05:00' });
  });
  it('never produces NaN or invents remaining size', () => {
    expect(downloadDetails({ size: 0, sizeleft: 10 }).ratio).toBe(0);
    expect(downloadDetails({ size: 100 }).remaining).toBeNull();
    expect(downloadDetails({ size: 100, sizeLeft: -5 }).ratio).toBe(100);
  });
  it('deduplicates diagnostics and identifies blocked downloads', () => {
    expect(downloadDetails({ trackedDownloadStatus: 'warning', errorMessage: 'Blocked', statusMessages: [{ title: 'Blocked', messages: ['No space'] }] })).toMatchObject({ blocked: true, messages: ['Blocked', 'No space'] });
  });
});
