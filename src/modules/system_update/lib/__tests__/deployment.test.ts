import { describe, expect, it } from '@jest/globals'
import {
  classifyDeploymentRelation,
  classifyRuntimePath,
  describeDeployError,
  formatDuration,
  mapDeploymentRun,
  sameCommit,
  selectRecentRuns,
  type DeploymentRun,
} from '../deployment'

const deployed = {
  schema: 1,
  runId: 'deploy-20261109114254-78609938',
  entry: 'auto',
  drill: false,
  production: true,
  startedAt: '2026-11-09T11:42:54.383Z',
  finishedAt: '2026-11-09T11:53:23.225Z',
  result: 'deployed',
  sha: '7860993868b719e9cbb3ef1dfce5fd55be050f91',
  shortSha: '78609938',
  lock: { path: '/home/pro/.local/state/ila3-deploy/deploy.lock', pid: 63464, acquiredAt: '2026-11-09T11:42:54.383Z' },
  steps: [
    { name: 'resolve-sha', ok: true },
    { name: 'switch', ok: true },
  ],
  evidence: { record: '/home/pro/.local/state/ila3-deploy/runs/deploy-20261109114254-78609938.json' },
  ciGate: { allow: true, decision: 'allow', reason: 'successful-test-workflow-for-sha' },
}

const refused = {
  runId: 'deploy-20261109102158-6c4b2621',
  entry: 'auto',
  drill: false,
  production: true,
  startedAt: '2026-11-09T10:21:58.939Z',
  finishedAt: '2026-11-09T10:21:59.741Z',
  result: 'refused',
  sha: '6c4b262166f3cf82d507ffd2526a9c664dea9608',
  steps: [{ name: 'ci-gate', ok: false }],
  error: {
    code: 'ci-gate-denied',
    message: 'ci-gate-denied',
    detail: {
      decision: 'deny',
      allow: false,
      reason: 'no-successful-test-run-for-sha',
      note: 'Push the commit and let the test workflow finish before deploying.',
    },
  },
}

describe('mapDeploymentRun', () => {
  it('maps a deployed record without inventing fields', () => {
    const run = mapDeploymentRun(deployed)
    expect(run).not.toBeNull()
    expect(run?.result).toBe('deployed')
    expect(run?.entry).toBe('auto')
    expect(run?.sha).toBe('7860993868b719e9cbb3ef1dfce5fd55be050f91')
    expect(run?.shortSha).toBe('78609938')
    expect(run?.durationMs).toBe(628_842)
    expect(run?.error).toBeNull()
    expect(run?.failedSteps).toEqual([])
    expect(run?.recordPath).toContain('/runs/deploy-20261109114254-78609938.json')
    expect(run?.ciGate).toEqual({
      allow: true,
      decision: 'allow',
      reason: 'successful-test-workflow-for-sha',
    })
    expect(run?.lockPid).toBe(63464)
  })

  it('keeps the specific gate reason in the failure text', () => {
    const run = mapDeploymentRun(refused)
    expect(run?.result).toBe('refused')
    expect(run?.failedSteps).toEqual(['ci-gate'])
    expect(run?.error?.code).toBe('ci-gate-denied')
    expect(run?.error?.detail).toBe('no-successful-test-run-for-sha')
    expect(run?.error?.text).toContain('no-successful-test-run-for-sha')
    expect(run?.error?.text).not.toContain('[object Object]')
  })

  it('maps the no-op redeploy result to already-current', () => {
    const run = mapDeploymentRun({ ...refused, result: 'already-current' })
    expect(run?.result).toBe('already-current')
  })

  it('accepts a string error and maps an unknown result explicitly', () => {
    const run = mapDeploymentRun({ runId: 'x', result: 'weird', error: 'boom' })
    expect(run?.result).toBe('unknown')
    expect(run?.error?.text).toBe('boom')
    expect(run?.entry).toBe('unknown')
  })

  it('rejects records without a runId', () => {
    expect(mapDeploymentRun({ result: 'deployed' })).toBeNull()
    expect(mapDeploymentRun(null)).toBeNull()
  })

  it('marks drills and keeps the record path override when the record has no evidence path', () => {
    const { evidence: _evidence, ...withoutEvidence } = deployed
    const run = mapDeploymentRun(
      { ...withoutEvidence, runId: 'drill-1', drill: true, entry: 'manual' },
      { recordPath: '/tmp/drill-1.json' },
    )
    expect(run?.drill).toBe(true)
    expect(run?.production).toBe(true)
    expect(run?.entry).toBe('manual')
    expect(run?.recordPath).toBe('/tmp/drill-1.json')
  })
})

describe('describeDeployError', () => {
  it('returns null for no error', () => {
    expect(describeDeployError(undefined)).toBeNull()
    expect(describeDeployError(null)).toBeNull()
    expect(describeDeployError({})).toBeNull()
  })

  it('prefers detail.reason over a repeated code', () => {
    const error = describeDeployError({
      code: 'candidate-unhealthy',
      message: 'candidate-unhealthy',
      detail: { reason: 'login-200 failed', message: 'candidate-unhealthy' },
    })
    expect(error?.text).toBe('candidate-unhealthy — login-200 failed')
  })

  it('truncates a large object detail instead of dumping it', () => {
    const error = describeDeployError({ code: 'x', detail: { blob: 'y'.repeat(1000) } })
    expect(error?.detail?.length).toBeLessThan(300)
  })
})

describe('selectRecentRuns', () => {
  const run = (runId: string, startedAt: string): DeploymentRun => ({
    runId,
    entry: 'auto',
    drill: false,
    production: true,
    result: 'deployed',
    sha: null,
    shortSha: null,
    startedAt,
    finishedAt: null,
    durationMs: null,
    error: null,
    failedSteps: [],
    ciGate: null,
    lockPid: null,
    recordPath: null,
  })

  it('sorts newest first, dedupes by runId and applies the limit', () => {
    const runs = [
      run('old', '2026-11-09T09:00:00.000Z'),
      run('new', '2026-11-09T11:00:00.000Z'),
      run('middle', '2026-11-09T10:00:00.000Z'),
      run('new', '2026-11-09T11:00:00.000Z'),
      run('older', '2026-11-09T08:00:00.000Z'),
      run('oldest', '2026-11-09T07:00:00.000Z'),
    ]
    expect(selectRecentRuns(runs, 3).map((entry) => entry.runId)).toEqual(['new', 'middle', 'old'])
  })
})

describe('sameCommit', () => {
  it('matches full SHAs and short build stamps', () => {
    expect(sameCommit('7860993868b719e9cbb3ef1dfce5fd55be050f91', '78609938')).toBe(true)
    expect(sameCommit('78609938', '7860993868b719e9cbb3ef1dfce5fd55be050f91')).toBe(true)
    expect(sameCommit('78609938', '3577d514')).toBe(false)
    expect(sameCommit('abc', 'abcdef')).toBe(false)
    expect(sameCommit(null, 'abc')).toBe(false)
  })
})

describe('classifyDeploymentRelation', () => {
  it('returns same for matching commits even when only a stamp is known', () => {
    expect(
      classifyDeploymentRelation({
        runningSha: '78609938',
        candidateSha: '7860993868b719e9cbb3ef1dfce5fd55be050f91',
        runningIsAncestor: null,
        candidateIsAncestor: null,
      }),
    ).toBe('same')
  })

  it('maps ancestry to behind/ahead/diverged and missing data to unknown', () => {
    const base = {
      runningSha: 'a'.repeat(40),
      candidateSha: 'b'.repeat(40),
    }
    expect(
      classifyDeploymentRelation({ ...base, runningIsAncestor: true, candidateIsAncestor: false }),
    ).toBe('behind')
    expect(
      classifyDeploymentRelation({ ...base, runningIsAncestor: false, candidateIsAncestor: true }),
    ).toBe('ahead')
    expect(
      classifyDeploymentRelation({ ...base, runningIsAncestor: false, candidateIsAncestor: false }),
    ).toBe('diverged')
    expect(
      classifyDeploymentRelation({ ...base, runningIsAncestor: null, candidateIsAncestor: null }),
    ).toBe('unknown')
    expect(
      classifyDeploymentRelation({
        runningSha: null,
        candidateSha: base.candidateSha,
        runningIsAncestor: true,
        candidateIsAncestor: false,
      }),
    ).toBe('unknown')
  })
})

describe('classifyRuntimePath', () => {
  it('labels a release slot and a development checkout explicitly', () => {
    expect(
      classifyRuntimePath('/home/pro/releases/mercato/78609938', '/home/pro/releases/mercato'),
    ).toBe('release')
    expect(classifyRuntimePath('/home/pro/apps/mercato', '/home/pro/releases/mercato')).toBe('dev')
    expect(classifyRuntimePath(null, '/home/pro/releases/mercato')).toBe('unknown')
    expect(
      classifyRuntimePath('/home/pro/releases/mercato-other/x', '/home/pro/releases/mercato'),
    ).toBe('dev')
  })
})

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(9_000)).toBe('9 秒')
    expect(formatDuration(629_000)).toBe('10 分 29 秒')
    expect(formatDuration(3_600_000)).toBe('1 小时')
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(Number.NaN)).toBeNull()
  })
})
