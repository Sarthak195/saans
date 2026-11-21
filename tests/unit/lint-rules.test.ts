import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Runs the repository's real ESLint config on in-memory snippets. Only the type-aware layer is
// switched off, because a snippet has no file on disk for the TypeScript project to find.
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfig: [
      {
        files: ['**/*.ts'],
        ...tseslint.configs.disableTypeChecked,
        languageOptions: { parserOptions: { projectService: false } },
      },
    ],
  });
});

async function boundaryMessages(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  const messages = result?.messages ?? [];
  const fatal = messages.find((m) => m.fatal === true);
  if (fatal) throw new Error(`Snippet did not parse: ${fatal.message}`);
  return messages
    .filter((m) => m.ruleId?.startsWith('no-restricted') === true)
    .map((m) => m.message);
}

const CORE = 'src/core/example.ts';
const SERVER = 'src/server/example.ts';
const GENAI_IMPORT = "import { GoogleGenAI } from '@google/genai';\nexport const g = GoogleGenAI;";

interface Banned {
  readonly name: string;
  readonly file: string;
  readonly code: string;
  readonly message: RegExp;
}

const banned: readonly Banned[] = [
  { name: 'Date.now() in core', file: CORE, code: 'export const t = Date.now();', message: /time/ },
  { name: 'new Date() in core', file: CORE, code: 'export const d = new Date();', message: /time/ },
  {
    name: 'Math.random() in core',
    file: CORE,
    code: 'export const r = Math.random();',
    message: /randomness/,
  },
  {
    name: 'process.env in core',
    file: CORE,
    code: 'export const k = process.env.KEY;',
    message: /environment/,
  },
  {
    name: 'fetch() in core',
    file: CORE,
    code: "export const p = fetch('/x');",
    message: /network/,
  },
  {
    name: 'node: import in core',
    file: CORE,
    code: "import { readFileSync } from 'node:fs';\nexport const f = readFileSync;",
    message: /Node built-ins/,
  },
  {
    name: 'fs import in core',
    file: CORE,
    code: "import fs from 'fs';\nexport const f = fs;",
    message: /Node built-ins/,
  },
  {
    name: 'path import in core',
    file: CORE,
    code: "import path from 'path';\nexport const p = path;",
    message: /Node built-ins/,
  },
  {
    name: '@/server import in core',
    file: CORE,
    code: "import { env } from '@/server/env';\nexport const e = env;",
    message: /src\/server/,
  },
  {
    name: 'relative server import in core',
    file: 'src/core/aqi/example.ts',
    code: "import { env } from '../../server/env';\nexport const e = env;",
    message: /src\/server/,
  },
  {
    name: 'module-scope let in server',
    file: SERVER,
    code: 'let counter = 0;\nexport const read = (): number => counter;\ncounter = 1;',
    message: /module-scope let/,
  },
  {
    name: 'exported let in server',
    file: SERVER,
    code: 'export let counter = 0;',
    message: /module-scope let/,
  },
  {
    name: 'module-scope Map in server',
    file: SERVER,
    code: 'const cache = new Map<string, string>();\nexport const c = cache;',
    message: /Map or Set/,
  },
  {
    name: 'module-scope Set in server',
    file: SERVER,
    code: 'export const seen = new Set<string>();',
    message: /Map or Set/,
  },
  {
    name: 'genai import outside the client',
    file: 'src/server/genai/briefing.ts',
    code: GENAI_IMPORT,
    message: /only in src\/server\/genai\/client\.ts/,
  },
  {
    name: 'genai import in core',
    file: CORE,
    code: GENAI_IMPORT,
    message: /only in src\/server\/genai\/client\.ts/,
  },
  {
    name: 'genai import in a route',
    file: 'src/app/example.ts',
    code: GENAI_IMPORT,
    message: /only in src\/server\/genai\/client\.ts/,
  },
];

const allowed: readonly { name: string; file: string; code: string }[] = [
  { name: 'new Date(value) in core', file: CORE, code: 'export const d = new Date(0);' },
  { name: 'Date.UTC in core', file: CORE, code: 'export const t = Date.UTC(2026, 0, 1);' },
  {
    name: 'a pure import in core',
    file: CORE,
    code: "import { z } from 'zod';\nexport const s = z.string();",
  },
  { name: 'process.env in server', file: SERVER, code: 'export const k = process.env.KEY;' },
  {
    name: 'Map and let inside a function in server',
    file: SERVER,
    code: 'export function f(): number {\n  const m = new Map<string, number>();\n  let n = 0;\n  n += m.size;\n  return n;\n}',
  },
  { name: 'module-scope const in server', file: SERVER, code: 'export const LIMIT = 8;' },
  { name: 'genai import in its client', file: 'src/server/genai/client.ts', code: GENAI_IMPORT },
];

describe('lint boundaries', () => {
  it.each(banned)('flags $name', async ({ file, code, message }) => {
    const messages = await boundaryMessages(file, code);
    expect(messages.some((m) => message.test(m))).toBe(true);
  });

  it.each(allowed)('allows $name', async ({ file, code }) => {
    expect(await boundaryMessages(file, code)).toEqual([]);
  });
});
