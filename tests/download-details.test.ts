import { describe, expect, it } from 'vitest';
import { downloadDetails, showRawDownloadStatus } from '@/composables/useDownloadDetails';
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
  it('prioritizes nested service errors over release titles while retaining all details', () => {
    const release = 'Example.Movie.2026.1080p.Bluray';
    expect(downloadDetails({ trackedDownloadState: 'importBlocked', statusMessages: [
      { title: release, messages: [' No space ', 'Permission denied'] },
      { title: release, messages: ['No space'] },
      { title: 'Other service context', messages: [] },
    ] })).toMatchObject({ blocked: true, messages: ['No space', 'Permission denied', release, 'Other service context'] });
  });
  it('keeps the explicit error first and deduplicates it across message sources', () => {
    expect(downloadDetails({ errorMessage: ' Blocked ', statusMessages: [
      { title: 'Release title', messages: ['Blocked', 'No space', ' No space '] },
      { title: 'No space', messages: ['Permission denied'] },
    ] }).messages).toEqual(['Blocked', 'No space', 'Permission denied', 'Release title']);
  });
  it('falls back to service titles when no substantive messages are provided', () => {
    expect(downloadDetails({ statusMessages: [{ title: ' Title-only error ', messages: ['', ' '] }] }).messages).toEqual(['Title-only error']);
  });
  it('hides equivalent completion summaries but preserves distinct technical states', () => {
    expect(showRawDownloadStatus(' Completed ', 'Download complete')).toBe(false);
    expect(showRawDownloadStatus('completed', 'Import needs attention')).toBe(true);
    expect(showRawDownloadStatus('completed', 'Imported')).toBe(true);
    expect(showRawDownloadStatus('downloading', 'Downloading')).toBe(false);
  });
});
