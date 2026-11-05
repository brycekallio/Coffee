import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Edge Functions: a const declared later in a block shadows the handler's `req` and
    // crashes at runtime (TDZ). That shipped once in review-resume; lint catches it now.
    files: ['supabase/functions/**/*.ts'],
    rules: {
      '@typescript-eslint/no-use-before-define': ['error', { functions: false, classes: false }],
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
    },
  },
])
