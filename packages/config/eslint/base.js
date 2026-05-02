import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const baseConfig = [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.turbo/**', '.vite/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default baseConfig;
