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

const GENAI_ONLY_IN_CLIENT = {
  name: '@google/genai',
  message: 'Import the Gemini SDK only in src/server/genai/client.ts and wrap it there.',
};

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
const MODULE_SCOPE = ':matches(Program, Program > ExportNamedDeclaration)';
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

export default defineConfig([
  globalIgnores(['.next/**', 'coverage/**', 'node_modules/**', 'next-env.d.ts', '.planning/**']),
  ...nextVitals,
  {
    // The App Router has no pages/ directory, and the rule warns on every run when it finds none.
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
  {
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
    files: ['src/server/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...SERVER_SYNTAX] },
  },
  {
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
