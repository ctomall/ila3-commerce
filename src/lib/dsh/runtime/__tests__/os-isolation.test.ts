/** @jest-environment node */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@jest/globals'
import {
  assertIsolationIdentity,
  buildIsolatedSpawn,
  dshIdentityHash,
  dshUnixUser,
  resolveOsIsolation,
  writeRunEnvFile,
} from '../os-isolation'

const identity = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }

describe('resolveOsIsolation', () => {
  it('is off unless explicitly enabled', () => {
    expect(resolveOsIsolation({})).toBeNull()
    expect(resolveOsIsolation({ OM_DSH_OS_ISOLATION: '0' })).toBeNull()
    expect(resolveOsIsolation({ OM_DSH_OS_ISOLATION: 'true' })).toBeNull()
  })

  it('uses the installed defaults when enabled', () => {
    expect(resolveOsIsolation({ OM_DSH_OS_ISOLATION: '1' })).toEqual({
      root: '/srv/dsh',
      provisionScript: '/usr/local/sbin/dsh-agent-provision',
      runner: '/usr/local/lib/dsh-agent/run-with-env',
      runDir: '/run/dsh-agent',
    })
  })

  it('honours explicit overrides', () => {
    expect(
      resolveOsIsolation({
        OM_DSH_OS_ISOLATION: '1',
        OM_DSH_ISOLATION_ROOT: '/tmp/iso',
        OM_DSH_PROVISION_SCRIPT: '/tmp/provision.sh',
        OM_DSH_RUNNER: '/tmp/runner',
        OM_DSH_RUN_DIR: '/tmp/runs',
      }),
    ).toMatchObject({ root: '/tmp/iso', provisionScript: '/tmp/provision.sh' })
  })
})

describe('identity derivation', () => {
  it('is stable and scoped to the full identity tuple', () => {
    const hash = dshIdentityHash(identity)
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
    expect(dshIdentityHash({ ...identity })).toBe(hash)
    expect(dshIdentityHash({ ...identity, userId: 'user-2' })).not.toBe(hash)
    expect(dshIdentityHash({ ...identity, organizationId: 'org-2' })).not.toBe(hash)
  })

  it('derives a 20 character system-user name', () => {
    const user = dshUnixUser(identity)
    expect(user).toMatch(/^dsh-[0-9a-f]{16}$/)
    expect(user).toBe(dshUnixUser({ ...identity }))
  })

  it('fails closed when the run has no identity', () => {
    expect(() => assertIsolationIdentity(undefined)).toThrow(/no tenant\/organization\/user identity/)
    expect(() => assertIsolationIdentity({ tenantId: 't', organizationId: 'o' })).toThrow()
    expect(assertIsolationIdentity(identity)).toEqual(identity)
  })
})

describe('run env file', () => {
  it('writes shell-safe exports readable by the employee group only', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-iso-test-'))
    const config = {
      root: '/srv/dsh',
      provisionScript: '/provision',
      runner: '/runner',
      runDir: root,
    }
    fs.mkdirSync(path.join(root, 'run-1'), { recursive: true })
    const file = writeRunEnvFile(config, 'run-1', {
      OM_DSH_TOOL_TOKEN: "tok'en with quote",
      PATH: '/usr/bin',
    })
    const content = fs.readFileSync(file, 'utf8')
    expect(content).toContain("export OM_DSH_TOOL_TOKEN='tok'\\''en with quote'")
    expect(content).toContain("export PATH='/usr/bin'")
    expect(fs.statSync(file).mode & 0o777).toBe(0o640)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('refuses environment names that are not shell identifiers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-iso-test-'))
    fs.mkdirSync(path.join(root, 'run-2'), { recursive: true })
    expect(() =>
      writeRunEnvFile(
        { root: '/srv/dsh', provisionScript: '/provision', runner: '/runner', runDir: root },
        'run-2',
        { 'BAD-NAME': 'x' },
      ),
    ).toThrow(/invalid environment name/)
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe('buildIsolatedSpawn', () => {
  it('runs the root-owned runner as the employee user, never the DSH binary directly', () => {
    const spawn = buildIsolatedSpawn({
      config: {
        root: '/srv/dsh',
        provisionScript: '/provision',
        runner: '/usr/local/lib/dsh-agent/run-with-env',
        runDir: '/run/dsh-agent',
      },
      provisioned: {
        user: 'dsh-0123456789abcdef',
        home: '/srv/dsh/homes/h',
        workspace: '/srv/dsh/workspaces/h/run-1',
        tmp: '/srv/dsh/tmp/h',
      },
      envFile: '/run/dsh-agent/run-1/env',
      command: '/home/pro/.local/bin/ila3-dsh-run',
      args: ['--profile', 'sdk-minimal'],
    })
    expect(spawn.command).toBe('sudo')
    expect(spawn.args.slice(0, 5)).toEqual([
      '-n',
      '-u',
      'dsh-0123456789abcdef',
      '--',
      '/usr/local/lib/dsh-agent/run-with-env',
    ])
    expect(spawn.args).toContain('/run/dsh-agent/run-1/env')
    expect(spawn.args).toContain('/home/pro/.local/bin/ila3-dsh-run')
    expect(spawn.cwd).toBe('/')
  })
})
