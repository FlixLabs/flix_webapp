import { afterEach, expect, it, vi } from 'vitest';
import { readApiJson, requireList, requireObject, optionalList } from '@/composables/apiResponse';
import { useAlert } from '@/composables/useAlert';

afterEach(() => vi.useRealTimers());

it.each([undefined, null, {}, 'error', [null], [1], [[]]])('rejects invalid lists: %j', value => {
  expect(() => requireList(value, 'records')).toThrow('Invalid records response');
});

it('accepts empty lists and validates required string fields', () => {
  expect(requireList([], 'records')).toEqual([]);
  expect(requireList([{ title: 'Example' }], 'movies', ['title'])).toHaveLength(1);
  expect(() => requireList([{}], 'movies', ['title'])).toThrow('Invalid movies response');
});

it('only defaults optional, absent arrays to empty lists', () => {
  expect(optionalList(undefined, 'languages')).toEqual([]);
  expect(optionalList(null, 'languages')).toEqual([]);
  expect(() => optionalList({}, 'languages')).toThrow('Invalid languages response');
});

it.each([null, undefined, [], 1])('rejects invalid objects: %j', value => {
  expect(() => requireObject(value, 'settings')).toThrow('Invalid settings response');
});

it('handles HTTP failures before parsing the body', async () => {
  const response = new Response('{}', { status: 503 });
  await expect(readApiJson(response)).rejects.toThrow('HTTP 503');
});

it.each(['null', '"error"', 'not JSON'])('handles invalid JSON payloads: %s', async body => {
  await expect(readApiJson(new Response(body))).rejects.toThrow(/Invalid .*response/);
});

it('accepts valid list and object bodies', async () => {
  expect(await readApiJson(new Response('[]'))).toEqual([]);
  expect(await readApiJson(new Response('{}'))).toEqual({});
});

it('shows the error message instead of passing an Error object to Vuetify', () => {
  vi.useFakeTimers();
  const { alert, showErrorAlert } = useAlert();
  showErrorAlert(new Error('Invalid service response'));
  expect(alert.value.text).toBe('Invalid service response');
  vi.runAllTimers();
});
