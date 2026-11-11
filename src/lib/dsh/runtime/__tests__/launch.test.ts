import { afterEach, describe, expect, it } from '@jest/globals'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startDshRun, stopChildProcess } from '../launch'
import type { DshEvent, DshRunHandle, DshRunInput } from '../types'

const FIXTURE = path.resolve(__dirname, '../tests/fixtures/fake-dsh-server.mjs')
const tempDirs: string[] = []
const handles: DshRunHandle[] = []

type Recorded = Record<string, unknown>

function makeRun(mode: string, overrides: Partial<DshRunInput> = {}): {
  input: DshRunInput
  recordPath: string
  workspace: string
  dshHome: string
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-a1-'))
  tempDirs.push(root)
  const workspace = path.join(root, 'workspace')
  const dshHome = path.join(root, 'home')
  fs.mkdirSync(workspace)
  fs.mkdirSync(dshHome)
  const recordPath = path.join(root, 'record.jsonl')
  const input: DshRunInput = {
    runId: 'run-a1',
    prompt: 'hello dsh',
    timeoutMs: 3_000,
    workspace,
    dshHome,
    command: process.execPath,
    args: [FIXTURE],
    env: { FAKE_DSH_MODE: mode, FAKE_DSH_RECORD: recordPath },
    ...overrides,
  }
  return { input, recordPath, workspace, dshHome }
}

async function start(input: DshRunInput): Promise<DshRunHandle> {
  const handle = await startDshRun(input)
  handles.push(handle)
  return handle
}

function readRecords(recordPath: string): Recorded[] {
  try {
    return fs.readFileSync(recordPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Recorded)
  } catch {
    return []
  }
}

async function waitForRecord(recordPath: string, kind: string, timeoutMs = 3_000): Promise<Recorded> {
  const started = Date.now()
  for (;;) {
    const entry = readRecords(recordPath).find((candidate) => candidate.kind === kind)
    if (entry !== undefined) return entry
    if (Date.now() - started > timeoutMs) throw new Error(`record ${kind} not found in ${recordPath}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function waitForProcessGone(pid: number, timeoutMs = 3_000): Promise<void> {
  const started = Date.now()
  for (;;) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    }
    if (Date.now() - started > timeoutMs) throw new Error(`process ${pid} is still alive`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

function killIfAlive(pid: number | undefined): void {
  if (pid === undefined) return
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
}

afterEach(async () => {
  for (const handle of handles.splice(0)) {
    try {
      await handle.close()
    } catch {
      // A test may already have moved on; cleanup is best-effort.
    }
  }
  for (const dir of tempDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // Best-effort temp cleanup.
    }
  }
})

describe('startDshRun', () => {
  it('materialises a missing workspace and DSH home before spawning', async () => {
    const { input } = makeRun('success')
    fs.rmSync(input.workspace, { recursive: true, force: true })
    fs.rmSync(input.dshHome, { recursive: true, force: true })
    const handle = await start(input)
    await handle.result
    expect(fs.existsSync(input.workspace)).toBe(true)
    expect(fs.existsSync(input.dshHome)).toBe(true)
  })

  it('runs one session/query successfully, streams seq from 1 and confirms close', async () => {
    const { input, recordPath } = makeRun('success')
    const handle = await start(input)
    const events: DshEvent[] = []
    const drained = (async () => {
      for await (const event of handle.events) events.push(event)
    })()

    await expect(handle.result).resolves.toEqual({
      finalResponse: 'hello world',
      finishReason: 'completed',
    })
    await drained

    expect(events.map((event) => event.seq)).toEqual([1, 2, 3])
    expect(events.every((event) => event.type === 'session.event')).toBe(true)
    expect(events.map((event) => (event.payload as { event: { type: string } }).event.type))
      .toEqual(['assistant/message', 'assistant/message', 'turn/end'])

    const records = readRecords(recordPath)
    const initialize = records.find((entry) => entry.kind === 'initialize')
    expect(initialize?.params).toMatchObject({
      cwd: input.workspace,
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      approvalRequests: true,
      capabilities: { userQuestions: true },
    })
    const query = records.find((entry) => entry.kind === 'query')
    expect(query?.params).toMatchObject({
      sessionId: handle.sessionId,
      contentBlocks: [{ type: 'text', text: 'hello dsh' }],
    })
    expect(records.some((entry) => entry.kind === 'wrong-protocol')).toBe(false)

    const startRecord = records.find((entry) => entry.kind === 'start')
    await expect(handle.close()).resolves.toEqual({ stopped: true })
    await waitForProcessGone(startRecord?.pid as number)
    // result settled exactly once and stays intact after close
    await expect(handle.result).resolves.toMatchObject({ finishReason: 'completed' })
  })

  it('forwards only PATH/HOME/DSH_* plus explicit env and forces the per-run DSH_HOME', async () => {
    const previousDb = process.env.MERCATO_DB_URL
    const previousDsh = process.env.DSH_PARENT
    process.env.MERCATO_DB_URL = 'postgres://should-never-reach-dsh'
    process.env.DSH_PARENT = 'from-parent'
    try {
      const { input, recordPath, workspace, dshHome } = makeRun('success')
      input.env = {
        ...input.env,
        FAKE_ALLOWED: 'explicit',
        // An explicit DSH_HOME must not be able to escape the per-employee home.
        DSH_HOME: '/tmp/definitely-wrong',
      }
      const handle = await start(input)
      await expect(handle.result).resolves.toMatchObject({ finishReason: 'completed' })

      const startRecord = readRecords(recordPath).find((entry) => entry.kind === 'start')
      expect(startRecord?.cwd).toBe(workspace)
      const env = startRecord?.env as Record<string, unknown>
      expect(env.DSH_HOME).toBe(dshHome)
      expect(env.DSH_PARENT).toBe('from-parent')
      expect(env.FAKE_ALLOWED).toBe('explicit')
      expect(env.MERCATO_DB_URL).toBeUndefined()
      await expect(handle.close()).resolves.toEqual({ stopped: true })
    } finally {
      if (previousDb === undefined) delete process.env.MERCATO_DB_URL
      else process.env.MERCATO_DB_URL = previousDb
      if (previousDsh === undefined) delete process.env.DSH_PARENT
      else process.env.DSH_PARENT = previousDsh
    }
  })

  it('times out a hung run, kills the process group and confirms exit', async () => {
    const { input, recordPath } = makeRun('tree', {
      timeoutMs: 350,
      stopGraceMs: 100,
      killGraceMs: 1_500,
    })
    const handle = await start(input)
    const result = await handle.result
    expect(result.finishReason).toBe('timed-out')
    expect(result.error).toMatch(/timed out/)
    await expect(handle.close()).resolves.toEqual({ stopped: true })

    const records = readRecords(recordPath)
    const startPid = records.find((entry) => entry.kind === 'start')?.pid as number
    const treePid = records.find((entry) => entry.kind === 'tree-child')?.pid as number
    try {
      await waitForProcessGone(startPid)
      await waitForProcessGone(treePid)
      expect(records.some((entry) => entry.kind === 'shutdown')).toBe(true)
    } finally {
      killIfAlive(startPid)
      killIfAlive(treePid)
    }
  })

  it('cancels a run that ignores SIGTERM, settling cancelled and escalating to SIGKILL', async () => {
    const { input, recordPath } = makeRun('ignore-sigterm', {
      timeoutMs: 5_000,
      stopGraceMs: 100,
      killGraceMs: 1_500,
    })
    const handle = await start(input)
    await waitForRecord(recordPath, 'query')
    const iterator = handle.events[Symbol.asyncIterator]()
    const firstEvent = await iterator.next()
    expect(firstEvent.done).toBe(false)

    await handle.cancel('operator cancelled')
    await expect(handle.result).resolves.toEqual({
      finalResponse: 'partial',
      finishReason: 'cancelled',
      error: 'operator cancelled',
    })
    await expect(handle.cancel('again')).resolves.toBeUndefined()
    await expect(handle.close()).resolves.toEqual({ stopped: true })

    const records = readRecords(recordPath)
    expect(records.some((entry) => entry.kind === 'sigterm')).toBe(true)
    await waitForProcessGone(records.find((entry) => entry.kind === 'start')?.pid as number)
  })

  it('settles cancelled when the caller AbortSignal fires', async () => {
    const controller = new AbortController()
    const { input, recordPath } = makeRun('ignore-sigterm', {
      timeoutMs: 5_000,
      stopGraceMs: 100,
      killGraceMs: 1_500,
      signal: controller.signal,
    })
    const handle = await start(input)
    await waitForRecord(recordPath, 'query')
    const iterator = handle.events[Symbol.asyncIterator]()
    await iterator.next()
    controller.abort(new Error('caller abort'))

    const result = await handle.result
    expect(result.finishReason).toBe('cancelled')
    expect(result.error).toBe('caller abort')
    await expect(handle.close()).resolves.toEqual({ stopped: true })
  })

  it('ignores malformed server lines and still completes from session.query.completed', async () => {
    const { input } = makeRun('malformed')
    const handle = await start(input)
    await expect(handle.result).resolves.toEqual({
      finalResponse: 'ok',
      finishReason: 'completed',
    })
    await expect(handle.close()).resolves.toEqual({ stopped: true })
  })

  it('answers approval/request and user-question/ask with rejected/cancelled', async () => {
    const { input, recordPath } = makeRun('server-requests', { timeoutMs: 5_000 })
    const handle = await start(input)
    await expect(handle.result).resolves.toMatchObject({
      finalResponse: 'rejected by policy',
      finishReason: 'completed',
    })
    const records = readRecords(recordPath)
    const approval = records.find((entry) => entry.kind === 'server-response' && entry.id === 'srv-approval-1')
    const question = records.find((entry) => entry.kind === 'server-response' && entry.id === 'srv-question-1')
    expect(approval?.result).toEqual({ outcome: 'rejected' })
    expect(question?.result).toEqual({ cancelled: true })
    await expect(handle.close()).resolves.toEqual({ stopped: true })
  })

  it('accepts a command receipt and matches session.query.completed by commandId', async () => {
    const { input } = makeRun('command')
    const handle = await start(input)
    await expect(handle.result).resolves.toEqual({
      finalResponse: 'hello world',
      finishReason: 'completed',
    })
    await expect(handle.close()).resolves.toEqual({ stopped: true })
  })

  it('rejects a hung initialize, kills the child and reports no process leak', async () => {
    const { input, recordPath } = makeRun('init-hang', {
      initializeTimeoutMs: 100,
      stopGraceMs: 100,
      killGraceMs: 1_500,
    })
    await expect(startDshRun(input)).rejects.toThrow(/dsh initialize failed/)
    const startRecord = await waitForRecord(recordPath, 'start')
    await waitForProcessGone(startRecord.pid as number)
  })

  it('reports stopped:true when the process already exited before close', async () => {
    const { input } = makeRun('self-exit')
    const handle = await start(input)
    const result = await handle.result
    expect(result.finishReason).toBe('completed')
    await new Promise((resolve) => setTimeout(resolve, 120))
    await expect(handle.close()).resolves.toEqual({ stopped: true })
    await expect(handle.result).resolves.toEqual(result)
  })

  it('reports stopped:false when no exit edge can be confirmed', async () => {
    class NeverExitingChild extends EventEmitter {
      pid = 2_147_483_646
      exitCode: number | null = null
      signalCode: NodeJS.Signals | null = null

      kill(): boolean {
        return false
      }
    }
    const fake = new NeverExitingChild()
    const child = fake as unknown as ChildProcess
    await expect(stopChildProcess(child, { stopGraceMs: 20, killGraceMs: 20 }))
      .resolves.toBe(false)

    fake.exitCode = 0
    await expect(stopChildProcess(child, { stopGraceMs: 20, killGraceMs: 20 }))
      .resolves.toBe(true)
  })
})
