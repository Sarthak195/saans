// ESLint flat config. It applies the Next.js rules and the strict TypeScript rules, and adds the
// layer rules from AGENTS.md: src/core stays pure and src/server holds no module-scope state.

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

// src/core holds every decision. Keeping it free of I/O, frameworks, clocks and randomness
// means each decision can be reproduced in a unit test with no network and no mocks.
const CORE_IMPORT_PATTERNS = [
  {
    group: ['node:*', 'fs', 'fs/*', 'path', 'crypto'],
    message:
      'src/core is pure: no Node built-ins. Do the I/O in src/server and pass the result in.',
  },
  {
    group: ['@/server', '@/server/**', '**/server', '**/server/**'],
    message: 'src/core must not depend on src/server. Pass what it needs in as parameters.',
  },
  {
    group: ['react', 'react-dom', 'next', 'next/*', 'server-only'],
    message: 'src/core is pure: no framework imports.',
  },
];

// The Gemini SDK may be imported only in src/server/genai/client.ts (a later block allows it
// there).
const GENAI_ONLY_IN_CLIENT = {
  name: '@google/genai',
  message: 'Import the Gemini SDK only in src/server/genai/client.ts and wrap it there.',
};

// Code that would make src/core depend on the clock, randomness, the environment or the network.
// The selectors match Date.now(), new Date() with no argument, Math.random(), process.env and
// fetch().
const CORE_SYNTAX = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'src/core must be deterministic: take the current time as a parameter.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'src/core must be deterministic: take the current time as a parameter.',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'src/core must be deterministic: take randomness as a parameter.',
  },
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: 'src/core must not read the environment: take configuration as a parameter.',
  },
  {
    selector: "CallExpression[callee.name='fetch']",
    message: 'src/core must not use the network: do the request in src/server.',
  },
];

// A module-scope variable that can change outlives a request and is shared by all of them,
// so one user can see another user's data and instances drift apart under load.
// Matches a statement at the top level of a file, whether or not it is exported.
const MODULE_SCOPE = ':matches(Program, Program > ExportNamedDeclaration)';
// Rules for src/server: no module-scope let or var, and no module-scope Map, Set, WeakMap or
// WeakSet.
const SERVER_SYNTAX = [
  {
    selector: `${MODULE_SCOPE} > VariableDeclaration[kind!='const']`,
    message: 'src/server is stateless: no module-scope let or var. Keep state in the request.',
  },
  {
    selector: `${MODULE_SCOPE} > VariableDeclaration > VariableDeclarator > NewExpression[callee.name=/^(Map|Set|WeakMap|WeakSet)$/]`,
    message: 'src/server is stateless: no module-scope Map or Set. Keep state in the request.',
  },
];

/** The lint rules for the whole repository, as config blocks that apply in order. */
export default defineConfig([
  // Build output, dependencies, generated files and local working folders are not linted.
  globalIgnores([
    '.next/**',
    'coverage/**',
    'node_modules/**',
    'next-env.d.ts',
    '.planning/**',
    '.claude/**',
  ]),
  // The Next.js recommended rules, including the Core Web Vitals checks.
  ...nextVitals,
  {
    // The App Router has no pages/ directory, and the rule warns on every run when it finds none.
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
  {
    // Strict, type-aware TypeScript rules for every TypeScript file.
    files: ['**/*.{ts,tsx,mts}'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'no-restricted-imports': ['error', { paths: [GENAI_ONLY_IN_CLIENT] }],
    },
  },
  {
    // The pure core: the import patterns and the syntax rules above apply only to these files.
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [GENAI_ONLY_IN_CLIENT], patterns: CORE_IMPORT_PATTERNS },
      ],
      'no-restricted-syntax': ['error', ...CORE_SYNTAX],
    },
  },
  {
    // The server may not keep changeable state at module scope.
    files: ['src/server/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...SERVER_SYNTAX] },
  },
  {
    // The one file that wraps the Gemini SDK may import it.
    files: ['src/server/genai/client.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Tests and scripts are ordinary Node programs: they print and need no module-boundary types.
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.{ts,mts,mjs}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    // Plain JavaScript sits outside the TypeScript program, so type-aware rules cannot run on it.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
