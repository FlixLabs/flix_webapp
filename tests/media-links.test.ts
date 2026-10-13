import { expect, it } from 'vitest';
import { loginDestination, mediaQuery, mediaTarget } from '@/composables/mediaLinks';

it('builds links with service IDs and optional instance names only', () => {
  expect(mediaQuery('series', 2, 'Test instance')).toEqual({ media: 'series', id: '2', instance: 'Test instance' });
  expect(mediaQuery('movies', 1)).toEqual({ media: 'movies', id: '1' });
});
it('validates media targets without accepting ambiguous IDs or query arrays', () => {
  expect(mediaTarget({ media: 'movies', id: '1', instance: 'Test' })).toEqual({ type: 'movies', id: 1, instance: 'Test' });
  for (const id of ['0', '-1', '1.2', '1e2', '', '9007199254740992']) expect(mediaTarget({ media: 'movies', id })).toBeNull();
  expect(mediaTarget({ media: ['movies'], id: '1' })).toBeNull();
  expect(mediaTarget({ media: 'movies', id: ['1', '2'] })).toBeNull();
  expect(mediaTarget({ media: 'movies', id: '1', instance: ['Test'] })).toBeNull();
});
it('retains internal destinations after login', () => {
  expect(loginDestination('/library?media=series&id=2&instance=Test%20instance')).toBe('/library?media=series&id=2&instance=Test%20instance');
  expect(loginDestination('/calendar')).toBe('/calendar');
});
it.each(['https://external.test', '//external.test', '/\\external.test', '/login', '/unknown', 'javascript:alert(1)', undefined, ['/library']])('rejects unsafe or unsupported return destinations: %j', value => {
  expect(loginDestination(value)).toBe('/dashboard');
});
