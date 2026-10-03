// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SERVER = './apps/server/src';

/** Layering rule (LLD §1.4): a layer must never import from a layer to its right. */
const LAYER_ZONES = [
  {
    target: `${SERVER}/domain`,
    from: [`${SERVER}/application`, `${SERVER}/infrastructure`, `${SERVER}/main.ts`, `${SERVER}/compose.ts`],
    message: 'domain/ is pure: it may only import from domain/ and @watchparty/shared.',
  },
  {
    target: `${SERVER}/application`,
    from: [`${SERVER}/infrastructure`, `${SERVER}/main.ts`, `${SERVER}/compose.ts`],
    message: 'application/ depends on ports, never on infrastructure/.',
  },
  {
    target: `${SERVER}/infrastructure`,
    from: [`${SERVER}/main.ts`, `${SERVER}/compose.ts`],
    message: 'Only the composition root (compose.ts, main.ts) wires infrastructure together.',
  },
  {
    target: './packages/shared',
    from: ['./apps'],
    message: '@watchparty/shared must not depend on any app.',
  },
];

export default defineConfig(
  globalIgnores(['**/dist/**', '**/coverage/**', '**/node_modules/**']),

  // ---------- all TypeScript ----------
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      importX.flatConfigs.recommended,
      importX.flatConfigs.typescript,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['tsconfig.json', 'packages/*/tsconfig.json', 'apps/*/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        }),
      ],
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: LAYER_ZONES }],
      'import-x/no-default-export': 'error',
      'import-x/no-cycle': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: '@watchparty/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-console': 'error',
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'anywhere' }],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'Never render user content as HTML.',
        },
      ],
    },
  },

  // ---------- server domain: pure, no I/O, no clock, no randomness ----------
  {
    files: ['apps/server/src/domain/**/*.ts'],
    rules: {
      'import-x/no-nodejs-modules': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!@watchparty/shared$|\\.{1,2}/)',
              message: 'domain/ may only import @watchparty/shared and relative domain modules.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Inject time via a `now` argument.' },
        { object: 'Math', property: 'random', message: 'Inject ids via IdGenerator.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'NewExpression[callee.name="Date"]', message: 'Inject time via a `now` argument.' },
      ],
    },
  },

  // ---------- server ----------
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // ---------- web ----------
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // ---------- tests: relaxed where test builders legitimately need it ----------
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  // ---------- domain tests may additionally import the test runner ----------
  {
    files: ['apps/server/src/domain/**/*.test.ts', 'apps/server/src/domain/test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!@watchparty/shared$|vitest$|\\.{1,2}/)',
              message: 'domain tests may only import vitest, @watchparty/shared and domain modules.',
            },
          ],
        },
      ],
    },
  },

  // ---------- vendored shadcn/ui components: generated by the CLI, regenerated rather than hand-edited ----------
  {
    files: ['apps/web/src/components/ui/**/*.tsx'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },

  // ---------- tests are composition roots: application tests may wire infrastructure adapters ----------
  {
    files: ['apps/server/src/application/**/*.test.ts', 'apps/server/src/application/test/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        { zones: LAYER_ZONES.filter((zone) => zone.target !== `${SERVER}/application`) },
      ],
    },
  },

  // ---------- tool configs require default exports ----------
  {
    files: ['**/*.config.{ts,js}', 'eslint.config.js'],
    rules: { 'import-x/no-default-export': 'off' },
  },

  // ---------- static browser scripts served from apps/web/public ----------
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },

  // ---------- plain JS config files: no type information ----------
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
