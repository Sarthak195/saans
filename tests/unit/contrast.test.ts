// Colour contrast, checked from the stylesheets themselves. Every colour pair the pages draw text or
// a control boundary with must meet WCAG 2.2: 4.5:1 for text (1.4.3) and 3:1 for the borders and
// focus ring a person needs to see (1.4.11). Values are read from the CSS, so a colour change that
// breaks a pair fails here before it reaches a page.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const GLOBALS = readFileSync('src/app/globals.css', 'utf8');
const COMPONENTS = readFileSync('src/app/components.css', 'utf8');

const TEXT = 4.5;
const BOUNDARY = 3;

/** The custom properties set to a six-digit hex colour, by name without the leading dashes. */
function tokens(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
}

const TOKENS = tokens(GLOBALS);

/** A token's colour, or a literal hex colour as given. Fails loudly when a token is missing. */
function colour(name: string): string {
  if (name.startsWith('#')) return name;
  const value = TOKENS.get(name);
  if (value === undefined) throw new Error(`No colour token --${name}`);
  return value;
}

/** The colour a property takes inside the first rule whose selector list ends with `selector`. */
function ruleColour(css: string, selector: string, property: string): string {
  const at = css.search(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{`));
  if (at === -1) throw new Error(`No rule for ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const value = new RegExp(`(?:^|[;\\s])${property}:\\s*(#[0-9a-f]{6})`, 'i').exec(body)?.[1];
  if (value === undefined) throw new Error(`No ${property} colour in ${selector}`);
  return value;
}

/** WCAG relative luminance of a hex colour. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, from 1 to 21. */
function contrast(a: string, b: string): number {
  const [light = 0, dark = 0] = [luminance(colour(a)), luminance(colour(b))].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('the contrast helper', () => {
  it('gives the known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('text colours', () => {
  const inputBackground = ruleColour(COMPONENTS, 'textarea', 'background');
  const buttonText = ruleColour(GLOBALS, '.button', 'color');
  const fieldError = ruleColour(COMPONENTS, '.field-error', 'color');

  it.each([
    ['body text on the page', 'color-text', 'color-bg'],
    ['body text on a card or notice', 'color-text', 'color-surface'],
    ['muted text on the page', 'color-text-muted', 'color-bg'],
    ['muted text on a card or notice', 'color-text-muted', 'color-surface'],
    ['a link on the page', 'color-link', 'color-bg'],
    ['a link on a card or notice', 'color-link', 'color-surface'],
    ['button text on a button', buttonText, 'color-link'],
    ['the current day link', 'color-bg', 'color-text'],
    ['typed text in a field', 'color-text', inputBackground],
    ['a field error on the page', fieldError, 'color-bg'],
    ['a field error on a card', fieldError, 'color-surface'],
  ])('%s reaches 4.5:1', (_what, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(TEXT);
  });

  it('every air band label reaches 4.5:1 on its own colour', () => {
    const bands = [...TOKENS.keys()].filter((k) => k.startsWith('band-') && k.endsWith('-bg'));
    expect(bands).toHaveLength(6);
    for (const background of bands) {
      const foreground = background.replace(/-bg$/, '-fg');
      expect(contrast(foreground, background), foreground).toBeGreaterThanOrEqual(TEXT);
    }
  });
});

describe('control boundaries and focus', () => {
  const inputBackground = ruleColour(COMPONENTS, 'textarea', 'background');

  it.each([
    ['a field border against the field', 'color-border', inputBackground],
    ['a field border against the page', 'color-border', 'color-bg'],
    ['the focus ring on the page', 'color-focus', 'color-bg'],
    ['the focus ring on a card', 'color-focus', 'color-surface'],
    ['an invalid field border against the field', 'band-very-poor-bg', inputBackground],
    ['an invalid field border against the page', 'band-very-poor-bg', 'color-bg'],
    ['a button border on the page', 'color-link', 'color-bg'],
  ])('%s reaches 3:1', (_what, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(BOUNDARY);
  });
});
