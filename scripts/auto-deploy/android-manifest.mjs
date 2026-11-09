/**
 * Android APK release manifest for the CRM upgrade pipeline.
 *
 * The web app deploys by swapping a release directory; the Android client pulls
 * an APK from a manifest. Those are different trust models, so the APK gets its
 * own contract: version monotonicity, byte hash, size, signing-certificate pin
 * and a rollout percentage. The client refuses an APK whose hash, version or
 * certificate does not match; the OS still enforces same-signer upgrades, this
 * manifest is the check that runs BEFORE the installer is invoked.
 *
 * Signing identity is read with `apksigner verify --print-certs` from the SDK
 * build-tools. Missing tooling fails closed (exit 5) instead of shipping an
 * unverified pin, and tests inject a verifier so the classification rules stay
 * covered without an SDK.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

export const EXIT = {
  ok: 0,
  invalid: 2,
  digestMismatch: 3,
  signerMismatch: 4,
  toolMissing: 5,
  versionInvalid: 6,
}

export function normalizeCertSha256(value) {
  return String(value || '')
    .replace(/[: ]/g, '')
    .toLowerCase()
}

export function readApkIdentity(apkPath, {buildTools = process.env.ANDROID_BUILD_TOOLS || '/home/pro/Android/Sdk/build-tools/34.0.0'} = {}) {
  const tool = path.join(buildTools, 'apksigner')
  if (!fs.existsSync(tool)) {
    return {ok: false, exit: EXIT.toolMissing, error: `apksigner not found at ${tool}`}
  }
  const run = spawnSync(tool, ['verify', '--print-certs', apkPath], {encoding: 'utf8'})
  if (run.status !== 0) {
    return {ok: false, exit: EXIT.invalid, error: `apksigner failed: ${(run.stderr || run.stdout || '').trim().slice(-300)}`}
  }
  const match = run.stdout.match(/Signer #1 certificate SHA-256 digest:\s*([0-9a-f:]+)/i)
  if (!match) return {ok: false, exit: EXIT.invalid, error: 'apksigner output has no certificate digest'}
  return {ok: true, certSha256: normalizeCertSha256(match[1])}
}

export function sha256File(file) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

export function buildAndroidManifest({
  apkPath,
  versionCode,
  versionName,
  minVersionCode = 0,
  rolloutPercent = 100,
  url,
  signerSha256 = null,
  notes = [],
  generatedAt = new Date().toISOString(),
  allowHttp = false,
  verifySigner = readApkIdentity,
} = {}) {
  if (!apkPath || !fs.existsSync(apkPath)) throw new Error(`apk not found: ${apkPath}`)
  const code = Number(versionCode)
  const minCode = Number(minVersionCode)
  const percent = Number(rolloutPercent)
  if (!Number.isInteger(code) || code <= 0) throw new Error('versionCode must be a positive integer')
  if (!Number.isInteger(minCode) || minCode < 0 || minCode > code) {
    throw new Error('minVersionCode must be an integer between 1 and versionCode')
  }
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new Error('rolloutPercent must be 1..100')
  // https is the contract; http is allowed only for an explicit isolated drill.
  if (!url || !(allowHttp ? /^https?:\/\// : /^https:\/\//).test(url)) {
    throw new Error(allowHttp ? 'url must be http(s) for a drill' : 'url must be an https URL')
  }

  const size = fs.statSync(apkPath).size
  const sha256 = sha256File(apkPath)
  let certSha256 = normalizeCertSha256(signerSha256)
  if (!certSha256) {
    const identity = verifySigner(apkPath)
    if (!identity.ok) return {ok: false, exit: identity.exit ?? EXIT.invalid, error: identity.error}
    certSha256 = normalizeCertSha256(identity.certSha256)
  } else {
    const identity = verifySigner(apkPath)
    if (!identity.ok) return {ok: false, exit: identity.exit ?? EXIT.invalid, error: identity.error}
    if (normalizeCertSha256(identity.certSha256) !== certSha256) {
      return {
        ok: false,
        exit: EXIT.signerMismatch,
        error: `signer mismatch: expected ${certSha256}, apk has ${normalizeCertSha256(identity.certSha256)}`,
      }
    }
  }

  return {
    ok: true,
    manifest: {
      schema: 1,
      kind: 'android-apk',
      generatedAt,
      version: {code, name: String(versionName || code), minVersionCode: minCode},
      artifact: {url, sha256, size},
      signature: {certSha256},
      rollout: {percent},
      notes: Array.isArray(notes) ? notes : [],
    },
  }
}

export function verifyAndroidManifest(manifest, {apkPath, verifySigner = readApkIdentity} = {}) {
  if (!manifest || manifest.schema !== 1 || manifest.kind !== 'android-apk') {
    return {ok: false, exit: EXIT.invalid, error: 'not an android-apk manifest (schema 1)'}
  }
  if (!apkPath || !fs.existsSync(apkPath)) return {ok: false, exit: EXIT.invalid, error: `apk not found: ${apkPath}`}
  const sha256 = sha256File(apkPath)
  if (manifest.artifact?.sha256 !== sha256) {
    return {ok: false, exit: EXIT.digestMismatch, error: `sha256 mismatch: manifest ${manifest.artifact?.sha256} apk ${sha256}`}
  }
  const size = fs.statSync(apkPath).size
  if (Number(manifest.artifact?.size) !== size) {
    return {ok: false, exit: EXIT.digestMismatch, error: `size mismatch: manifest ${manifest.artifact?.size} apk ${size}`}
  }
  const identity = verifySigner(apkPath)
  if (!identity.ok) return {ok: false, exit: identity.exit ?? EXIT.invalid, error: identity.error}
  const expected = normalizeCertSha256(manifest.signature?.certSha256)
  if (!expected || expected !== normalizeCertSha256(identity.certSha256)) {
    return {ok: false, exit: EXIT.signerMismatch, error: `signer mismatch: manifest ${expected} apk ${normalizeCertSha256(identity.certSha256)}`}
  }
  const code = Number(manifest.version?.code)
  const minCode = Number(manifest.version?.minVersionCode ?? 0)
  if (!Number.isInteger(code) || code <= 0 || minCode < 0 || minCode > code) {
    return {ok: false, exit: EXIT.versionInvalid, error: 'invalid version block'}
  }
  return {ok: true, manifest}
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2)
  const arg = (name, fallback = null) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] ?? fallback : fallback
  }
  try {
    if (args.includes('--verify')) {
      const manifestPath = arg('--manifest')
      const apkPath = arg('--apk')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      const result = verifyAndroidManifest(manifest, {apkPath})
      console.log(JSON.stringify(result, null, 2))
      process.exit(result.ok ? EXIT.ok : result.exit ?? EXIT.invalid)
    }
    const result = buildAndroidManifest({
      apkPath: arg('--apk'),
      versionCode: arg('--version-code'),
      versionName: arg('--version-name'),
      minVersionCode: arg('--min-version-code', '0'),
      rolloutPercent: arg('--rollout', '100'),
      url: arg('--url'),
      signerSha256: arg('--signer'),
      notes: (arg('--notes', '') || '').split('|').filter(Boolean),
      allowHttp: args.includes('--allow-http'),
    })
    if (!result.ok) {
      console.error(result.error)
      process.exit(result.exit ?? EXIT.invalid)
    }
    const out = arg('--out')
    if (out) fs.writeFileSync(out, `${JSON.stringify(result.manifest, null, 2)}\n`)
    console.log(JSON.stringify(result.manifest, null, 2))
    process.exit(EXIT.ok)
  } catch (error) {
    console.error(error.message)
    process.exit(EXIT.invalid)
  }
}
