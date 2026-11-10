import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareMigrations, migrationName } from './audit-pending-migrations.mjs'

test('derives the migration name from the file name', () => {
  assert.equal(migrationName('Migration20261109164011_communications.ts'), 'Migration20261109164011')
  assert.equal(migrationName('Migration20260710133207_onboarding.js'), 'Migration20260710133207')
  assert.equal(migrationName('README.md'), null)
})

test('reports pending migrations per module and skips modules without a table', () => {
  const { checked, pending } = compareMigrations({
    filesByModule: {
      communications: ['Migration20261109164011_communications.ts', 'Migration20261110081559_communications.ts'],
      documents: ['Migration20260708163836_documents.js'],
      not_installed: ['Migration20260101000000_not_installed.js'],
    },
    appliedByTable: {
      mikro_orm_migrations_communications: [],
      mikro_orm_migrations_documents: ['Migration20260708163836'],
    },
  })
  assert.equal(checked, 3)
  assert.deepEqual(
    pending.map((row) => `${row.module}:${row.name}`),
    ['communications:Migration20261109164011', 'communications:Migration20261110081559'],
  )
})

test('filters to one module when requested', () => {
  const { pending } = compareMigrations({
    filesByModule: {
      communications: ['Migration20261109164011_communications.ts'],
      documents: ['Migration20260708163836_documents.js'],
    },
    appliedByTable: {
      mikro_orm_migrations_communications: [],
      mikro_orm_migrations_documents: [],
    },
    onlyModule: 'documents',
  })
  assert.deepEqual(pending.map((row) => row.module), ['documents'])
})
