import next from 'eslint-config-next'

const config = [
  ...next,
  {
    ignores: [
      '.data/**',
      'ops/**',
      'test-results/**',
      'playwright-report/**',
      '.tmp/**',
      '.playwright-mcp/**',
    ],
  },
  // The React 19/ESLint ecosystem is still settling. These rules are valuable,
  // but they currently trigger a lot of false positives in this codebase.
  // Keep them off until we do a dedicated refactor pass.
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  // Discourage bare `fetch('/api/...')`. Code should use `apiFetch<T>()` from
  // `@/lib/api-client` so that 401 / 403 / 5xx / network failures are handled
  // uniformly (401 redirects to /login, the rest throw typed ApiError).
  // Warn level for incremental migration; api-client.ts itself is exempt.
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    ignores: ['src/lib/api-client.ts'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "CallExpression[callee.name='fetch'] > Literal[value=/^\\/api\\//]",
          message:
            "Use apiFetch<T>() from '@/lib/api-client' instead of bare fetch('/api/...'). It handles 401 redirect, 403/5xx typed errors, and network failures uniformly.",
        },
      ],
    },
  },
  // Layer-10 complexity ratchet: lock in the current quality of the Opzava core
  // (src/opzava). Thresholds are set at/above today's worst case so this gates
  // future decay rather than forcing a refactor. Tests are exempt (fixtures);
  // max-lines-per-function is intentionally omitted (factory-of-closures idiom).
  {
    files: ['src/opzava/**/*.ts'],
    ignores: ['src/opzava/**/*.test.ts'],
    rules: {
      complexity: ['error', 20],
      'max-depth': ['error', 4],
      'max-nested-callbacks': ['error', 5],
    },
  },
]

export default config
