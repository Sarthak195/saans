import { readFileSync } from 'node:fs';

import { vi } from 'vitest';

import { AppError, type AppErrorKind } from '@/server/errors';

// Real replies from the geocoding service, recorded by scripts/record-fixtures.ts.
export function recorded(name: string): unknown {
  const file = JSON.parse(readFileSync(`tests/fixtures/geocode/${name}.json`, 'utf8')) as {
    body: unknown;
  };
  return file.body;
}

export function replyWith(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', mock);
  return mock;
}

export async function kindOf(promise: Promise<unknown>): Promise<AppErrorKind | 'resolved'> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    if (error instanceof AppError) return error.kind;
    throw error;
  }
}
