// @ts-check
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default defineConfig(
  { ignores: ['dist/', '.astro/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  astro.configs.recommended,
  // Accessibility rules for .astro templates (via eslint-plugin-jsx-a11y-x).
  astro.configs['jsx-a11y-strict'],
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.astro'],
    rules: {
      // Allow role="list" on unstyled lists: Safari/VoiceOver drops list semantics when list-style is none.
      'astro/jsx-a11y/no-redundant-roles': ['error', { ul: ['list'], ol: ['list'] }],
    },
  },
);
