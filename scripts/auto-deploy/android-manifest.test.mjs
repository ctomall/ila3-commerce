import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  EXIT,
  buildAndroidManifest,
  normalizeCertSha256,
  readApkIdentity,
  sha256File,
  verifyAndroidManifest,
} from './android-manifest.mjs'

const CERT = '38:8e:89:80:73:60:07:ac:9f:10:a8:30:34:8c:ab:4f:24:ef:67:f2:2c:48:c2:9b:0a:5a:37:06:2d:ef:37'
const OTHER = 'aa'.repeat(32)

function fakeApk(bytes = 'not-a-real-apk') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ila3-apk-'))
  const file = path.join(dir, 'app.apk')
  fs.writeFileSync(file, bytes)
  return file
}

const verifier = (cert) => () => ({ok: true, certSha256: cert})
const brokenVerifier = () => ({ok: false, exit: EXIT.toolMissing, error: 'apksigner not found'})

test('builds a manifest with hash, size, version, cert and rollout', () => {
  const apk = fakeApk('payload')
  const result = buildAndroidManifest({
    apkPath: apk,
    versionCode: 37136,
    versionName: '3.71.36',
    minVersionCode: 37100,
    rolloutPercent: 25,
    url: 'https://example.test/dist/tongpin-3.71.36.apk',
    signerSha256: CERT,
    notes: ['crm mode', 'ota pin'],
    generatedAt: '2026-11-09T00:00:00.000Z',
    verifySigner: verifier(CERT),
  })
  assert.equal(result.ok, true)
  const m = result.manifest
  assert.equal(m.kind, 'android-apk')
  assert.equal(m.version.code, 37136)
  assert.equal(m.version.name, '3.71.36')
  assert.equal(m.version.minVersionCode, 37100)
  assert.equal(m.artifact.sha256, sha256File(apk))
  assert.equal(m.artifact.size, fs.statSync(apk).size)
  assert.equal(m.signature.certSha256, normalizeCertSha256(CERT))
  assert.equal(m.rollout.percent, 25)
  assert.deepEqual(m.notes, ['crm mode', 'ota pin'])
})

test('pinned certificate that does not match the APK is refused', () => {
  const apk = fakeApk()
  const result = buildAndroidManifest({
    apkPath: apk,
    versionCode: 1,
    url: 'https://example.test/a.apk',
    signerSha256: OTHER,
    verifySigner: verifier(CERT),
  })
  assert.equal(result.ok, false)
  assert.equal(result.exit, EXIT.signerMismatch)
})

test('missing apksigner fails closed', () => {
  const apk = fakeApk()
  const result = buildAndroidManifest({apkPath: apk, versionCode: 1, url: 'https://example.test/a.apk', verifySigner: brokenVerifier})
  assert.equal(result.ok, false)
  assert.equal(result.exit, EXIT.toolMissing)
})

test('invalid version, rollout and URL are rejected', () => {
  const apk = fakeApk()
  const base = {apkPath: apk, versionCode: 10, url: 'https://example.test/a.apk', verifySigner: verifier(CERT)}
  assert.throws(() => buildAndroidManifest({...base, minVersionCode: 11}), /minVersionCode/)
  assert.throws(() => buildAndroidManifest({...base, rolloutPercent: 0}), /rolloutPercent/)
  assert.throws(() => buildAndroidManifest({...base, url: 'http://example.test/a.apk'}), /https/)
  assert.throws(() => buildAndroidManifest({...base, versionCode: 0}), /versionCode/)
})

test('verify accepts an intact manifest', () => {
  const apk = fakeApk('intact')
  const built = buildAndroidManifest({apkPath: apk, versionCode: 5, url: 'https://example.test/a.apk', verifySigner: verifier(CERT)})
  const verified = verifyAndroidManifest(built.manifest, {apkPath: apk, verifySigner: verifier(CERT)})
  assert.equal(verified.ok, true)
})

test('verify rejects a tampered APK by digest', () => {
  const apk = fakeApk('original')
  const built = buildAndroidManifest({apkPath: apk, versionCode: 5, url: 'https://example.test/a.apk', verifySigner: verifier(CERT)})
  fs.writeFileSync(apk, 'tampered')
  const verified = verifyAndroidManifest(built.manifest, {apkPath: apk, verifySigner: verifier(CERT)})
  assert.equal(verified.ok, false)
  assert.equal(verified.exit, EXIT.digestMismatch)
})

test('verify rejects a re-signed APK with another certificate', () => {
  const apk = fakeApk('resigned')
  const built = buildAndroidManifest({apkPath: apk, versionCode: 5, url: 'https://example.test/a.apk', verifySigner: verifier(CERT)})
  const verified = verifyAndroidManifest(built.manifest, {apkPath: apk, verifySigner: verifier(OTHER)})
  assert.equal(verified.ok, false)
  assert.equal(verified.exit, EXIT.signerMismatch)
})

test('verify refuses a foreign manifest shape', () => {
  const apk = fakeApk()
  assert.equal(verifyAndroidManifest({kind: 'web'}, {apkPath: apk}).ok, false)
})

test('cert normalisation strips colons and lowercases', () => {
  assert.equal(normalizeCertSha256('AA:BB:cc'), 'aabbcc')
  assert.equal(normalizeCertSha256(null), '')
})

test('real release APK signs with the pinned Tongpin certificate', (t) => {
  const real = '/home/pro/dsh/tongpin/native/dist/tongpin-3.71.35-local.apk'
  if (!fs.existsSync(real)) return t.skip('no local release APK to inspect')
  const identity = readApkIdentity(real)
  if (!identity.ok) return t.skip(`apksigner unavailable: ${identity.error}`)
  const built = buildAndroidManifest({
    apkPath: real,
    versionCode: 37135,
    versionName: '3.71.35',
    url: 'https://example.test/tongpin-3.71.35.apk',
    signerSha256: '388e898098736007ac9f10a830348cab4f24ef67f22c48c29b0a5a37062def37',
    verifySigner: readApkIdentity,
  })
  assert.equal(built.ok, true, built.error)
  assert.equal(built.manifest.signature.certSha256, '388e898098736007ac9f10a830348cab4f24ef67f22c48c29b0a5a37062def37')
})
