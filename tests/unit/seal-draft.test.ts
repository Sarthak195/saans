import { randomBytes } from 'node:crypto';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { SAMPLES } from '@/core/profile/samples';
import { openDraft, openHousehold, sealDraft, sealHousehold } from '@/server/seal';

beforeAll(() => {
  vi.stubEnv('SEAL_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('FORM_KEY', randomBytes(32).toString('base64'));
});

const OPTION = { name: 'Aurangabad', admin1: 'Maharashtra', lat: 19.9, lon: 75.3 };

describe('sealDraft and openDraft', () => {
  it('round-trips the text, the places to choose from and the reason', () => {
    const draft = { text: 'We live in Aurangabad', options: [OPTION], reason: 'Pick a place.' };
    expect(openDraft(sealDraft(draft))).toEqual(draft);
  });

  it('is not interchangeable with a household token', () => {
    const household = SAMPLES[0]?.household;
    if (household === undefined) throw new Error('no sample');
    expect(() => openDraft(sealHousehold(household))).toThrow(/unknown version/);
    expect(() => openHousehold(sealDraft({ text: 'hi', options: [] }))).toThrow(/unknown version/);
  });

  it('cuts a very long text so the link still fits instead of failing', () => {
    // Text that does not compress, so it would overflow a link at full length.
    const noisy = Array.from({ length: 1500 }, (_, i) =>
      String.fromCodePoint(0x0900 + ((i * 7919) % 120)),
    ).join('');
    const opened = openDraft(sealDraft({ text: noisy, options: [OPTION] }));
    expect(opened.text.length).toBeGreaterThan(100);
    expect(noisy.startsWith(opened.text)).toBe(true);
  });
});
