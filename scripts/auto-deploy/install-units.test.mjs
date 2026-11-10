import {test} from 'node:test'
import assert from 'node:assert/strict'
import {compareUnit} from './install-units.mjs'

test('identical unit files compare as same (trailing newline ignored)', () => {
  assert.equal(compareUnit('[Service]\nExecStart=/bin/true\n', '[Service]\nExecStart=/bin/true').status, 'same')
})

test('comments and blank lines are documentation, not drift', () => {
  assert.equal(compareUnit('# explain\n[Service]\n\nExecStart=/bin/true\n', '[Service]\nExecStart=/bin/true\n').status, 'same')
})

test('a changed directive is reported with the line number', () => {
  const out = compareUnit('[Service]\nTimeoutStopSec=90\n', '[Service]\nTimeoutStopSec=30\n')
  assert.equal(out.status, 'drift')
  assert.match(out.lines[0], /line 2/)
  assert.match(out.lines[0], /TimeoutStopSec=90/)
})

test('an absent unit on the host is missing, not drift', () => {
  assert.equal(compareUnit('[Service]\n', null).status, 'missing')
})

test('line-ending differences do not count as drift', () => {
  assert.equal(compareUnit('[Service]\nExecStart=/bin/true\n', '[Service]\r\nExecStart=/bin/true\r\n').status, 'same')
})
