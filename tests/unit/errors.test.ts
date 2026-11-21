import { describe, expect, it } from 'vitest';

import { AppError, userMessage, type AppErrorKind } from '@/server/errors';

const KINDS: AppErrorKind[] = [
  'upstream_timeout',
  'upstream_bad_shape',
  'upstream_unavailable',
  'no_data',
  'geocode_none',
  'geocode_ambiguous',
  'outside_india',
  'token_invalid',
  'token_too_large',
  'form_expired',
  'body_too_large',
  'genai_quota',
  'genai_blocked',
  'genai_schema',
  'genai_timeout',
  'genai_unavailable',
];

describe('AppError', () => {
  it('carries its kind, a name and the original cause', () => {
    const cause = new Error('socket hang up');
    const error = new AppError('upstream_unavailable', 'could not reach', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe('upstream_unavailable');
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('could not reach');
    expect(error.cause).toBe(cause);
  });

  it('falls back to the kind as its message', () => {
    expect(new AppError('no_data').message).toBe('no_data');
  });
});

describe('userMessage', () => {
  it.each(KINDS)('gives %s a title, a body and a next action', (kind) => {
    const message = userMessage(kind);
    expect(message.title.length).toBeGreaterThan(5);
    expect(message.body.length).toBeGreaterThan(20);
    expect(message.nextAction.length).toBeGreaterThan(5);
  });

  it('has a distinct title for every kind', () => {
    const titles = KINDS.map((kind) => userMessage(kind).title);
    expect(new Set(titles).size).toBe(KINDS.length);
  });

  it('never apologises, blames or uses internal words', () => {
    const text = KINDS.flatMap((kind) => [
      userMessage(kind).title,
      userMessage(kind).body,
      userMessage(kind).nextAction,
    ])
      .join(' ')
      .toLowerCase();
    for (const word of [
      'sorry',
      'apolog',
      'your fault',
      'json',
      'schema',
      'token',
      'http',
      'error',
    ]) {
      expect(text).not.toContain(word);
    }
  });
});
