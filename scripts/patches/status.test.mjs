import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from './status.mjs'

const manifest = {
  patches: [
    { id: 'applied', target: 'a.js', marker: '/* m */' },
    { id: 'pending', target: 'b.js', marker: '/* m */' },
    { id: 'drifted', target: 'c.js', marker: '/* m */' },
    { id: 'multi', targets: ['a.js', 'b.js'], marker: '/* n */' },
  ],
}

const files = { 'a.js': '/* m */ code', 'b.js': 'plain' }

test('reports applied, pending and missing-target patches', () => {
  const summary = summarize({
    manifest,
    exists: (p) => p in files,
    readFile: (p) => files[p],
  })
  assert.equal(summary.total, 4)
  assert.equal(summary.applied, 1)
  assert.deepEqual(summary.missingTargets.map((e) => e.id), ['drifted'])
  assert.equal(summary.entries.find((e) => e.id === 'applied').markerPresent, true)
  assert.equal(summary.entries.find((e) => e.id === 'pending').markerPresent, false)
})

test('marks a patch applied only when every target carries the marker', () => {
  const withMarker = { 'a.js': '/* n */ code', 'b.js': '/* n */ more' }
  const summary = summarize({ manifest: { patches: manifest.patches.slice(3) }, exists: (p) => p in withMarker, readFile: (p) => withMarker[p] })
  assert.equal(summary.total, 1)
  assert.equal(summary.entries[0].missing.length, 0)
  assert.equal(summary.entries[0].markerPresent, true)
})
