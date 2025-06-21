import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  // JavaScriptの推奨ルール
  js.configs.recommended,

  {
    files: ['**/*.ts'],
    ignores: ['node_modules', 'dist', 'logs', 'main.js', 'src/llm/llmManager.d.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: globals.browser,
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    files: ['src/i18n/index.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
      },
    },
  },
];
