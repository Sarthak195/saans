import { randomBytes } from 'node:crypto';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/server/errors';
import {
  assertSameOrigin,
  issueFormToken,
  readFormLimited,
  verifyFormToken,
} from '@/server/guards';

beforeAll(() => {
  vi.stubEnv('SEAL_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('FORM_KEY', randomBytes(32).toString('base64'));
});

function kindOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error.kind;
    throw error;
  }
  return 'no error';
}

function originKind(request: Request): string {
  return kindOf(() => {
    assertSameOrigin(request);
  });
}

async function asyncKindOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) return error.kind;
    throw error;
  }
  return 'no error';
}

const FORM = 'application/x-www-form-urlencoded';

function post(headers: Record<string, string>, body = 'a=1', url = 'https://saans.example/ask') {
  return new Request(url, { method: 'POST', headers, body });
}

describe('readFormLimited', () => {
  it('parses a urlencoded body, including charset and repeated fields', async () => {
    const request = post(
      { 'content-type': `${FORM}; charset=UTF-8` },
      'place=Lajpat+Nagar&text=h%C3%A9llo&tag=a&tag=b',
    );
    const form = await readFormLimited(request);
    expect(form.get('place')).toBe('Lajpat Nagar');
    expect(form.get('text')).toBe('héllo');
    expect(form.getAll('tag')).toEqual(['a', 'b']);
  });

  it('returns an empty form for a request with no body', async () => {
    const request = new Request('https://saans.example/ask', {
      method: 'POST',
      headers: { 'content-type': FORM },
    });
    expect([...(await readFormLimited(request)).keys()]).toEqual([]);
  });

  it('refuses a body whose Content-Length is over the cap, without reading it', async () => {
    const request = post({ 'content-type': FORM, 'content-length': '9000' }, 'a=1');
    expect(await asyncKindOf(() => readFormLimited(request))).toBe('body_too_large');
  });

  it('refuses a streamed body that passes the cap with no Content-Length', async () => {
    const chunk = new TextEncoder().encode('a=' + 'x'.repeat(3000) + '&');
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 5) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const request = new Request('https://saans.example/ask', {
      method: 'POST',
      headers: { 'content-type': FORM },
      body,
      duplex: 'half',
    } as RequestInit);
    expect(await asyncKindOf(() => readFormLimited(request))).toBe('body_too_large');
  });

  it('refuses a body that lies about a small Content-Length', async () => {
    const request = post({ 'content-type': FORM, 'content-length': '5' }, 'a=' + 'x'.repeat(9000));
    expect(await asyncKindOf(() => readFormLimited(request))).toBe('body_too_large');
  });

  it('accepts a body exactly at the cap and honours a custom cap', async () => {
    const exact = 'a=' + 'x'.repeat(8190);
    expect((await readFormLimited(post({ 'content-type': FORM }, exact))).get('a')).toHaveLength(
      8190,
    );
    expect(
      await asyncKindOf(() => readFormLimited(post({ 'content-type': FORM }, 'a=12345'), 4)),
    ).toBe('body_too_large');
  });

  it('refuses other content types', async () => {
    for (const type of ['application/json', 'multipart/form-data; boundary=x', 'text/plain']) {
      const request = post({ 'content-type': type }, '{}');
      expect(await asyncKindOf(() => readFormLimited(request))).toBe('body_too_large');
    }
    const none = new Request('https://saans.example/ask', { method: 'POST', body: 'a=1' });
    expect(await asyncKindOf(() => readFormLimited(none))).toBe('body_too_large');
  });
});

describe('assertSameOrigin', () => {
  const url = 'https://saans.example/ask';
  const req = (headers: Record<string, string>) => new Request(url, { method: 'POST', headers });

  it('allows an Origin that matches the request origin', () => {
    expect(originKind(req({ origin: 'https://saans.example' }))).toBe('no error');
  });

  it('refuses a cross-origin Origin', () => {
    expect(originKind(req({ origin: 'https://evil.example' }))).toBe('cross_origin');
    expect(originKind(req({ origin: 'null' }))).toBe('cross_origin');
    expect(originKind(req({ origin: 'http://saans.example' }))).toBe('cross_origin');
    expect(originKind(req({ origin: 'https://saans.example.evil.example' }))).toBe('cross_origin');
  });

  it('uses the forwarded host and protocol behind a proxy', () => {
    const behind = (headers: Record<string, string>) =>
      new Request('http://10.0.0.2:8080/ask', { method: 'POST', headers });
    const proxied = {
      origin: 'https://saans.example',
      host: '10.0.0.2:8080',
      'x-forwarded-host': 'saans.example',
      'x-forwarded-proto': 'https',
    };
    expect(originKind(behind(proxied))).toBe('no error');
    expect(originKind(behind({ ...proxied, origin: 'http://10.0.0.2:8080' }))).toBe('cross_origin');
  });

  it('takes the first value when a proxy chain joins forwarded headers', () => {
    const request = new Request('http://internal/ask', {
      method: 'POST',
      headers: {
        origin: 'https://saans.example',
        'x-forwarded-host': 'saans.example, internal',
        'x-forwarded-proto': 'https, http',
      },
    });
    expect(originKind(request)).toBe('no error');
  });

  it('falls back to the Host header, then the request URL', () => {
    const byHost = new Request('http://internal/ask', {
      method: 'POST',
      headers: { origin: 'http://saans.example', host: 'saans.example' },
    });
    expect(originKind(byHost)).toBe('no error');
    const byUrl = req({ origin: 'https://saans.example' });
    expect(originKind(byUrl)).toBe('no error');
  });

  it('refuses when the forwarded host is not a valid host', () => {
    const request = req({ origin: 'https://saans.example', 'x-forwarded-host': 'bad host/' });
    expect(originKind(request)).toBe('cross_origin');
  });

  it('without Origin, allows only same-origin and direct navigation', () => {
    expect(originKind(req({ 'sec-fetch-site': 'same-origin' }))).toBe('no error');
    expect(originKind(req({ 'sec-fetch-site': 'none' }))).toBe('no error');
    expect(originKind(req({ 'sec-fetch-site': 'cross-site' }))).toBe('cross_origin');
    expect(originKind(req({ 'sec-fetch-site': 'same-site' }))).toBe('cross_origin');
    expect(originKind(req({}))).toBe('cross_origin');
  });

  it('trusts Origin over Sec-Fetch-Site when both are present', () => {
    const request = req({ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' });
    expect(originKind(request)).toBe('cross_origin');
  });
});

describe('form tokens', () => {
  const now = new Date('2026-11-22T06:00:00.000Z');
  const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);

  it('issues issuedAt.signature and verifies it', () => {
    const token = issueFormToken(now);
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
    expect(token.startsWith(`${String(now.getTime() / 1000)}.`)).toBe(true);
    expect(verifyFormToken(token, now)).toBe(true);
  });

  it('accepts a token up to 30 minutes old and refuses it after', () => {
    const token = issueFormToken(now);
    expect(verifyFormToken(token, at(30 * 60))).toBe(true);
    expect(verifyFormToken(token, at(30 * 60 + 1))).toBe(false);
  });

  it('accepts a small clock lead and refuses a token from further ahead', () => {
    const token = issueFormToken(at(60));
    expect(verifyFormToken(token, now)).toBe(true);
    expect(verifyFormToken(issueFormToken(at(61)), now)).toBe(false);
  });

  it('refuses a forged signature, a changed time and a token from another key', () => {
    const token = issueFormToken(now);
    const [issued = '', signature = ''] = token.split('.');
    const flipped = signature.startsWith('A') ? 'B' : 'A';
    expect(verifyFormToken(`${issued}.${flipped}${signature.slice(1)}`, now)).toBe(false);
    expect(verifyFormToken(`${String(Number(issued) + 1)}.${signature}`, now)).toBe(false);
    expect(verifyFormToken(`${issued}.${signature}x`, now)).toBe(false);
    expect(verifyFormToken(`${issued}.${signature.slice(0, 20)}`, now)).toBe(false);
  });

  it('refuses malformed tokens without throwing', () => {
    for (const token of [
      '',
      '.',
      'abc',
      '123.',
      '.abc',
      '1.2.3',
      'abc.def',
      '-5.AAAA',
      '1e3.AAAA',
    ]) {
      expect(verifyFormToken(token, now), token).toBe(false);
    }
  });
});
