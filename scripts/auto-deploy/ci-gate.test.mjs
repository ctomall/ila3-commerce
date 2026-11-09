import {test} from 'node:test'
import assert from 'node:assert/strict'
import {extractRunBlocks, extractTestEvidence} from './ci-gate.mjs'

function workflow(steps) {
  return `name: build-artifact
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
${steps}
`
}

test('build-only workflow has no test step', () => {
  const evidence = extractTestEvidence(
    workflow(`      - name: Install
        run: yarn install --frozen-lockfile
      - name: Build
        run: yarn build`),
  )
  assert.equal(evidence.hasTest, false)
  assert.equal(evidence.runBlocks, 2)
})

test('inline yarn test is detected', () => {
  const evidence = extractTestEvidence(
    workflow(`      - name: Build
        run: yarn build
      - name: Test
        run: yarn test`),
  )
  assert.equal(evidence.hasTest, true)
  assert.match(evidence.steps[0].command, /yarn test/)
})

test('block scalar test command is detected', () => {
  const evidence = extractTestEvidence(
    workflow(`      - name: Test
        run: |
          yarn install --frozen-lockfile
          yarn test:integration`),
  )
  assert.equal(evidence.hasTest, true)
  assert.match(evidence.steps[0].command, /yarn test:integration/)
})

test('commented test line does not count', () => {
  const evidence = extractTestEvidence(
    workflow(`      - name: Build
        run: |
          # yarn test
          yarn build`),
  )
  assert.equal(evidence.hasTest, false)
})

test('test github action is detected', () => {
  const evidence = extractTestEvidence(
    workflow(`      - uses: microsoft/playwright-github-action@v1
      - name: Build
        run: yarn build`),
  )
  assert.equal(evidence.hasTest, true)
  assert.equal(evidence.steps[0].source, 'uses')
})

test('extractRunBlocks keeps line numbers', () => {
  const blocks = extractRunBlocks(
    workflow(`      - name: Build
        run: yarn build`),
  )
  assert.equal(blocks.length, 1)
  assert.match(blocks[0].command, /yarn build/)
  assert.equal(blocks[0].line, 10)
})
