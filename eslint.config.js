import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/mock', '**/services/mock/**', '@/services/mock', '@/services/mock/*', '**/services/supabase', '**/services/supabase/**', '@/services/supabase', '@/services/supabase/*', '@supabase/*'],
              message: 'UI must depend on service interfaces only. Use useServices() from "@/services".',
            },
            {
              group: ['@/mock-data', '@/mock-data/*', '**/mock-data', '**/mock-data/**'],
              message: 'Seed data is private to the mock service layer. Fetch data through a service instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // Only the mock layer itself, the service factory and tests may touch mock code and seed data.
    files: ['src/services/**', 'src/mock-data/**', 'tests/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
