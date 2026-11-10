import {test} from 'node:test'
import assert from 'node:assert/strict'
import {shouldUseArtifactPath} from './deploy.mjs'

// The production default must be "download the CI package". Local builds are an
// explicit fallback, and drills keep their previous behaviour.
test('production/manual default uses the CI artifact', () => {
  assert.equal(shouldUseArtifactPath({}), true)
  assert.equal(shouldUseArtifactPath({mode: 'auto'}), true)
})
test('explicit --build-locally wins', () => {
  assert.equal(shouldUseArtifactPath({buildLocally: true}), false)
})
test('drills keep the local build unless they opt in', () => {
  assert.equal(shouldUseArtifactPath({drill: true}), false)
  assert.equal(shouldUseArtifactPath({drill: true, fromArtifact: true}), true)
})
test('synthetic --release-dir is never replaced by a download', () => {
  assert.equal(shouldUseArtifactPath({releaseDir: '/tmp/x'}), false)
})
