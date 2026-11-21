import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sourceRefSchema } from '@/core/source';

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const STATUSES = new Set(['P-READ', 'P-FETCH', 'APP']);
// A row that names its source under one of these keys is checked even when its status is missing or misspelt.
const SOURCE_KEYS = new Set(['source', 'trigger', 'guardSource', 'alsoSource']);

function dataFiles(): string[] {
  // The recordings are API snapshots, not sourced rows: they carry their own provenance block.
  return readdirSync(DATA_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

/** Every object in the tree that looks like a source (a known `status`, or under a source key), with where it sits. */
function sourcesIn(node: unknown, at: string, key = ''): { at: string; value: unknown }[] {
  if (Array.isArray(node))
    return node.flatMap((item, i) => sourcesIn(item, `${at}[${String(i)}]`, key));
  if (typeof node !== 'object' || node === null) return [];
  const record = node as Record<string, unknown>;
  const known = typeof record.status === 'string' && STATUSES.has(record.status);
  if (known || SOURCE_KEYS.has(key)) return [{ at, value: record }];
  return Object.entries(record).flatMap(([name, child]) => sourcesIn(child, `${at}.${name}`, name));
}

describe('every data file', () => {
  it('has JSON files to check', () => {
    expect(dataFiles().length).toBeGreaterThanOrEqual(11);
  });

  it.each(dataFiles())('%s carries only sources that pass the shared schema', (file) => {
    const json: unknown = JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf8'));
    const sources = sourcesIn(json, file);
    expect(sources.length).toBeGreaterThan(0);
    for (const { at, value } of sources) {
      const result = sourceRefSchema.safeParse(value);
      expect(result.success, `${at}: ${result.success ? '' : result.error.message}`).toBe(true);
    }
  });

  it.each(dataFiles())(
    '%s keeps Saans rules without links and fetched pages without quotes',
    (file) => {
      const json: unknown = JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf8'));
      for (const { at, value } of sourcesIn(json, file)) {
        const source = value as { status?: string; url?: string; quote?: unknown };
        // A Saans rule must not read as a government statement, and a paraphrase must not claim verbatim words.
        if (source.status === 'APP') expect(source.url, at).toBe('');
        if (source.status === 'P-FETCH') expect(source.quote, at).toBeUndefined();
      }
    },
  );
});

describe('source schema rules', () => {
  const base = { id: 'x', title: 'A document', url: 'https://example.org/a', status: 'P-FETCH' };

  it('needs a quote and an https URL for a document that was read', () => {
    const read = { ...base, status: 'P-READ' };
    expect(sourceRefSchema.safeParse(read).success).toBe(false);
    expect(sourceRefSchema.safeParse({ ...read, quote: '' }).success).toBe(false);
    expect(sourceRefSchema.safeParse({ ...read, quote: 'exact words' }).success).toBe(true);
    expect(
      sourceRefSchema.safeParse({ ...read, quote: 'exact words', url: 'http://example.org' })
        .success,
    ).toBe(false);
  });

  it('needs an https URL for a fetched page', () => {
    expect(sourceRefSchema.safeParse(base).success).toBe(true);
    expect(sourceRefSchema.safeParse({ ...base, url: '' }).success).toBe(false);
    expect(sourceRefSchema.safeParse({ ...base, url: 'ftp://example.org' }).success).toBe(false);
  });

  it('lets an app rule have no URL but makes its title start with Saans', () => {
    const app = { ...base, status: 'APP', url: '' };
    expect(sourceRefSchema.safeParse({ ...app, title: 'Saans vocabulary' }).success).toBe(true);
    expect(sourceRefSchema.safeParse({ ...app, title: 'Saans rule: a choice' }).success).toBe(true);
    expect(sourceRefSchema.safeParse(app).success).toBe(false);
    expect(
      sourceRefSchema.safeParse({ ...app, title: 'Saans rule', url: 'http://x.org' }).success,
    ).toBe(false);
  });

  it('rejects keys it does not know', () => {
    expect(sourceRefSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
