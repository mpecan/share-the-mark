import { defineConfig, globalIgnores } from 'eslint/config';
import type { ESLint } from 'eslint';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unicorn from 'eslint-plugin-unicorn';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Flat, type-aware ESLint config — see SPEC §8.2.
// Composition order is significant: prettier MUST come last so it can switch
// off every stylistic rule that would otherwise fight the formatter.
export default defineConfig(
  // Never lint generated output, build artifacts, or vendored code.
  globalIgnores([
    '.wxt/**',
    '.output/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'stats.html',
    'demo/**',
    // Rust crate build dir (build.rs copies the embed bundle into target/) + the
    // vendored bundle — both are built JS artifacts, never source to lint.
    'cli/target/**',
    'cli/embed/**',
    // Built npm package output (@share-the-mark/embed) — bundled JS, never source.
    'packages/*/dist/**',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  importX.configs['flat/recommended'],

  // Type-aware parsing for the whole project via the TS project service, plus
  // the TypeScript-aware import resolver (so import-x understands path aliases
  // and `.ts` extensions). import-x's bundled resolver preset ships an
  // incompatible interface, so wire the resolver explicitly here.
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
  },

  // React rules, scoped to the React surfaces (popup, options, panel). The
  // drawing overlay is deliberately framework-free (SPEC §5.1), so React rules
  // must not bleed onto it.
  {
    files: ['**/*.tsx'],
    // These plugins ship loose `configs` typings that don't satisfy the strict
    // flat-config `Plugin` type; the runtime shape is correct.
    plugins: {
      'react-hooks': reactHooks as unknown as ESLint.Plugin,
      'react-refresh': reactRefresh as unknown as ESLint.Plugin,
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },

  // Project-wide rule tuning. Each unicorn rule disabled below carries a
  // justification, as required by SPEC §8.2.
  {
    rules: {
      // DOM and Web Extension APIs are null-based (querySelector, the
      // ExportSink resolve path, browser.* callbacks). Fighting that with
      // undefined everywhere is noise, not safety.
      'unicorn/no-null': 'off',
      // Short, idiomatic identifiers (`el`, `ref`, `props`, `params`, `fn`,
      // `e` for events) read more clearly than the expansions unicorn forces
      // in DOM/React code.
      'unicorn/prevent-abbreviations': 'off',
      // React component files conventionally use PascalCase (App.tsx); WXT
      // entrypoint files use lowercase. Allow both rather than rename against
      // ecosystem convention.
      'unicorn/filename-case': [
        'error',
        { cases: { camelCase: true, pascalCase: true, kebabCase: true } },
      ],
      // We group class members by role (public API, then pointer handlers, then
      // private helpers) rather than by the plugin's fixed ordering.
      'unicorn/consistent-class-member-order': 'off',
    },
  },

  // Tests legitimately use patterns the source rules discourage: assigning to
  // a module-scoped `let` from `beforeEach`, and vitest's `expect.any()` /
  // matcher helpers that surface as `any`.
  {
    files: ['tests/**'],
    rules: {
      'unicorn/no-top-level-assignment-in-function': 'off',
      // Deeply nested fixture constructors and literal expected strings (with
      // significant whitespace) are normal and clearer in tests.
      'unicorn/max-nested-calls': 'off',
      'unicorn/prefer-string-repeat': 'off',
    },
  },

  // Config files (and any plain JS) are outside the typed program: turn off
  // type-checked rules for them and give them Node globals.
  {
    files: ['**/*.{js,cjs,mjs}', '*.config.{ts,mts,cts}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // prettier last — disables conflicting stylistic rules.
  prettier,
);
