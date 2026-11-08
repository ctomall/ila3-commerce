// Flat ESLint config for a standalone Open Mercato app.
// `next lint` was removed in Next 16, so `yarn lint` runs the ESLint CLI
// against this config instead.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const ignores = [
  'node_modules/**',
  '.next/**',
  '.mercato/**',
  '.ai/framework-context/**',
  'dist/**',
  'out/**',
  'build/**',
  'next-env.d.ts',
  // Generated test output, not source. `yarn test:integration` writes a Playwright
  // HTML report and traces here; when a run failed, the minified report bundle was
  // linted as application code and took the lint gate down with a bogus React-hook
  // error. Keep generated artefacts out of the linter the same way .gitignore does.
  // Anchored on purpose: a bare `**/test-results/**` would also skip a hand-written
  // `src/**/test-results/` directory if one ever appeared.
  '.ai/qa/test-results/**',
  '.ai/qa/playwright-report/**',
]

const ruleOverrides = {
  'react/display-name': 'off',
  'react-hooks/immutability': 'off',
  'react-hooks/preserve-manual-memoization': 'off',
  'react-hooks/purity': 'off',
  'react-hooks/refs': 'off',
  'react-hooks/set-state-in-effect': 'off',
  'react-hooks/static-components': 'off',
}

export default [
  ...nextCoreWebVitals,
  { ignores },
  { name: 'app/rule-overrides', rules: ruleOverrides },
]
