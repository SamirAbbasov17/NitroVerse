import js from '@eslint/js';
import globals from 'globals';

// Minimal dəst: üslub yox, yalnız real buq tutan qaydalar.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'peerserver/node_modules/**', 'tests/out/**', '.netlify/**', 'promo-upload/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.worker },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // i18n `t` funksiyasının lokal dəyişənlə kölgələnməsi real buq mənbəyidir (docs/UI.md)
      'no-shadow': ['warn', { allow: ['e', 'i', 'k', 'v', 'x', 'y', 'z', 'a', 'b', 'c', 'd', 'n', 'p', 'r', 's'] }],
    },
  },
  {
    files: ['tests/**/*.js', 'playwright.config.js', 'eslint.config.js', 'vite.config.js',
      'server/**/*.mjs', 'netlify/**/*.mjs', 'peerserver/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-assignment': 'warn',
    },
  },
];
