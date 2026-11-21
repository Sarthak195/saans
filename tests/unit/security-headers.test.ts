import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxy } from '@/proxy';
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  createNonce,
} from '@/server/security-headers';

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split('; ').map((part) => {
      const [name = '', ...rest] = part.split(' ');
      return [name, rest.join(' ')];
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createNonce', () => {
  it('is base64, 128 bits and different every time', () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(nonce);
  });
});

describe('buildContentSecurityPolicy', () => {
  const production = directives(buildContentSecurityPolicy({ nonce: 'abc', isProduction: true }));

  it('allows scripts and styles only from this origin or with the nonce', () => {
    expect(production.get('script-src')).toBe("'self' 'nonce-abc' 'strict-dynamic'");
    expect(production.get('style-src')).toBe("'self' 'nonce-abc'");
  });

  it('locks down everything else', () => {
    expect(production.get('default-src')).toBe("'self'");
    expect(production.get('img-src')).toBe("'self' data:");
    expect(production.get('connect-src')).toBe("'self'");
    expect(production.get('font-src')).toBe("'self'");
    expect(production.get('frame-ancestors')).toBe("'none'");
    expect(production.get('form-action')).toBe("'self'");
    expect(production.get('base-uri')).toBe("'none'");
    expect(production.get('object-src')).toBe("'none'");
  });

  it('never allows inline or eval scripts in production', () => {
    const policy = buildContentSecurityPolicy({ nonce: 'abc', isProduction: true });
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
  });

  it('upgrades insecure requests in production only', () => {
    expect(production.has('upgrade-insecure-requests')).toBe(true);
    const development = directives(
      buildContentSecurityPolicy({ nonce: 'abc', isProduction: false }),
    );
    expect(development.has('upgrade-insecure-requests')).toBe(false);
    expect(development.get('script-src')).toContain("'unsafe-eval'");
  });
});

describe('buildSecurityHeaders', () => {
  it('sets the fixed hardening headers', () => {
    const headers = buildSecurityHeaders({ nonce: 'abc', isProduction: true });
    expect(headers).toMatchObject({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    expect(headers['Content-Security-Policy']).toContain("'nonce-abc'");
  });
});

describe('proxy', () => {
  it('sends the policy on the response and hands the same one to Next on the request', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = proxy(new NextRequest('https://saans.example/'));
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('uses a different nonce for each request', () => {
    const first = proxy(new NextRequest('https://saans.example/'));
    const second = proxy(new NextRequest('https://saans.example/'));
    expect(first.headers.get('Content-Security-Policy')).not.toBe(
      second.headers.get('Content-Security-Policy'),
    );
  });

  it('ignores a policy supplied by the client', () => {
    const request = new NextRequest('https://saans.example/', {
      headers: { 'Content-Security-Policy': "script-src 'nonce-attacker'" },
    });
    const policy = proxy(request).headers.get('x-middleware-request-content-security-policy');
    expect(policy).not.toContain('attacker');
  });
});
