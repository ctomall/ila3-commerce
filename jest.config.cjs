/** @type {import('jest').Config} */
// Unit-test config for a standalone Open Mercato app.
// Integration tests run through Playwright (`yarn test:integration:ephemeral`)
// and are excluded here.
// `create-mercato-app` skips `__tests__`/`__integration__` while copying the
// template, so a freshly scaffolded app owns no test files until you write one.
// Process-spawning suites (DSH launcher, MCP child, chat route) need a few
// seconds; under external CPU contention on a shared host (e.g. a running
// Android emulator) the 30 s default can be exceeded by a test that passes in
// seconds on an idle machine. JEST_TIMEOUT raises the ceiling only for that
// invocation; CI keeps the default.
const timeoutFromEnv = Number.parseInt(process.env.JEST_TIMEOUT ?? '', 10)
const testTimeout =
  Number.isFinite(timeoutFromEnv) && timeoutFromEnv >= 1000 && timeoutFromEnv <= 300000
    ? timeoutFromEnv
    : 30000

module.exports = {
  testEnvironment: 'node',
  testTimeout,

  rootDir: '.',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/\\.mercato/(.*)$': '<rootDir>/.mercato/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^#generated/(.*)$': '<rootDir>/.mercato/generated/$1',
  },
  // `@open-mercato/shared/lib/commands` pulls in ESM-only MikroORM, whose
  // `import.meta.resolve` cannot be parsed as CommonJS. The local transformer
  // strips those usages before delegating to ts-jest; without it every command,
  // entity, or data-engine test fails to load.
  transform: {
    '^.+\.[tj]sx?$': [
      '<rootDir>/scripts/jest-mikroorm-transformer.cjs',
      {
        tsconfig: {
          jsx: 'react-jsx',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowJs: true,
          isolatedModules: true,
        },
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!(@open-mercato|@mikro-orm|@tanstack/react-table|@tanstack/table-core|@tanstack/react-store|@tanstack/store)/)'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/.mercato/', '/.ai/qa/'],
}
