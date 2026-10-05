// SPDX-License-Identifier: AGPL-3.0-only
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'public/', 'test-results/', 'playwright-report/', 'worker/node_modules/', 'worker/.wrangler/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', console: 'readonly', process: 'readonly', URL: 'readonly', fetch: 'readonly', Buffer: 'readonly' },
    },
    rules: {
      'max-lines': ['error', { max: 750, skipBlankLines: false, skipComments: false }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error', 'log'] }],
      eqeqeq: 'error',
    },
  },
);
