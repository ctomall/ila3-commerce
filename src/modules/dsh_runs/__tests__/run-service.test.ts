import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  RunOwnershipError,
  createRunService,
  defaultIdempotencyKey,
  hashPrompt,
  type RunService,
  type RunServiceRepository,
} from '../services/run-service'
import {
  RunNotFoundError,
  TerminalRunError,
  type BindingRecord,
  type DshRunStore,
  type RunEventRecord,
  type RunRecord,
} from '../services/run-store'

const TENANT_ID = 'tenant-1'
const ORG_ID = 'org-1'
const USER_ID = 'user-1'
const BINDING_ID = 'binding-1'
const RUN_ID = 'run-1'
const T0 = '2026-11-11T09:00:00.000Z'

const identity = { tenantId: TENANT_ID, organizationId: ORG_ID, userId: USER_ID }

function bindingRecord(overrides: Partial<BindingRecord> = {}): BindingRecord {
  return {
    id: BINDING_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    userId: USER_ID,
    assistantId: 'crm-assistant',
    status: 'active',
    revision: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  }
}

function runRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: RUN_ID,
    bindingId: BINDING_ID,
    userId: USER_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    sessionId: 'dsh-session-1',
    status: 'queued',
    idempotencyKey: 'key-1',
    requestHash: 'hash-1',
    cursor: 0,
    resultJson: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: T0,
    ...overrides,
  }
}

function eventRecord(overrides: Partial<RunEventRecord> = {}): RunEventRecord {
  return {
    id: 'event-1',
    runId: RUN_ID,
    seq: 1,
    type: 'text',
    payloadJson: { type: 'text', content: 'hi' },
    createdAt: T0,
    ...overrides,
  }
}

describe('createRunService', () => {
  let service: RunService
  let store: DshRunStore
  let repository: RunServiceRepository
  let idSeq: number

  let submitMock: jest.Mock<DshRunStore['submit']>
  let startMock: jest.Mock<DshRunStore['start']>
  let appendEventMock: jest.Mock<DshRunStore['appendEvent']>
  let finishMock: jest.Mock<DshRunStore['finish']>
  let eventsAfterMock: jest.Mock<DshRunStore['eventsAfter']>
  let revokeBindingMock: jest.Mock<DshRunStore['revokeBinding']>

  let findBindingByScopeMock: jest.Mock<RunServiceRepository['findBindingByScope']>
  let insertBindingMock: jest.Mock<RunServiceRepository['insertBinding']>
  let getBindingMock: jest.Mock<RunServiceRepository['getBinding']>
  let getRunMock: jest.Mock<RunServiceRepository['getRun']>

  beforeEach(() => {
    idSeq = 0
    submitMock = jest.fn<DshRunStore['submit']>()
    startMock = jest.fn<DshRunStore['start']>()
    appendEventMock = jest.fn<DshRunStore['appendEvent']>()
    finishMock = jest.fn<DshRunStore['finish']>()
    eventsAfterMock = jest.fn<DshRunStore['eventsAfter']>()
    revokeBindingMock = jest.fn<DshRunStore['revokeBinding']>()

    findBindingByScopeMock = jest.fn<RunServiceRepository['findBindingByScope']>()
    insertBindingMock = jest.fn<RunServiceRepository['insertBinding']>()
    getBindingMock = jest.fn<RunServiceRepository['getBinding']>()
    getRunMock = jest.fn<RunServiceRepository['getRun']>()

    findBindingByScopeMock.mockResolvedValue(null)
    insertBindingMock.mockImplementation(async (binding) => binding)
    getBindingMock.mockResolvedValue(null)
    getRunMock.mockResolvedValue(null)

    store = {
      submit: submitMock,
      start: startMock,
      appendEvent: appendEventMock,
      finish: finishMock,
      recoverInFlight: jest.fn<DshRunStore['recoverInFlight']>(async () => []),
      eventsAfter: eventsAfterMock,
      revokeBinding: revokeBindingMock,
    }

    repository = {
      getBinding: getBindingMock,
      saveBinding: jest.fn<RunServiceRepository['saveBinding']>(async (binding) => binding),
      getRun: getRunMock,
      getRunByIdempotencyKey: jest.fn<RunServiceRepository['getRunByIdempotencyKey']>(async () => null),
      listRunsByBinding: jest.fn<RunServiceRepository['listRunsByBinding']>(async () => []),
      listRunsByStatuses: jest.fn<RunServiceRepository['listRunsByStatuses']>(async () => []),
      insertRun: jest.fn<RunServiceRepository['insertRun']>(async (run) => run),
      updateRun: jest.fn<RunServiceRepository['updateRun']>(async (run) => run),
      insertEvent: jest.fn<RunServiceRepository['insertEvent']>(async (event) => event),
      getEvent: jest.fn<RunServiceRepository['getEvent']>(async () => null),
      listEventsAfter: jest.fn<RunServiceRepository['listEventsAfter']>(async () => []),
      findBindingByScope: findBindingByScopeMock,
      insertBinding: insertBindingMock,
    }

    service = createRunService({
      store,
      repository,
      now: () => new Date(T0),
      newId: () => `id-${++idSeq}`,
    })
  })

  describe('ensureBinding', () => {
    it('creates one active binding with the default assistant id', async () => {
      const binding = await service.ensureBinding(identity)

      expect(binding).toEqual({
        id: 'id-1',
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
        assistantId: 'crm-assistant',
        status: 'active',
        revision: 1,
        createdAt: T0,
        updatedAt: T0,
      })
      expect(findBindingByScopeMock).toHaveBeenCalledWith(identity)
      expect(insertBindingMock).toHaveBeenCalledWith(binding)
    })

    it('returns an existing binding without re-inserting or reviving it', async () => {
      const revoked = bindingRecord({ status: 'revoked', revision: 4 })
      findBindingByScopeMock.mockResolvedValueOnce(revoked)

      await expect(service.ensureBinding(identity)).resolves.toBe(revoked)
      expect(insertBindingMock).not.toHaveBeenCalled()

      const suspended = bindingRecord({ status: 'suspended', revision: 2 })
      findBindingByScopeMock.mockResolvedValueOnce(suspended)
      await expect(service.ensureBinding(identity)).resolves.toBe(suspended)
      expect(insertBindingMock).not.toHaveBeenCalled()
    })

    it('honours an explicit assistant id', async () => {
      const binding = await service.ensureBinding(identity, 'crm-ops')

      expect(binding.assistantId).toBe('crm-ops')
      expect(insertBindingMock).toHaveBeenCalledWith(expect.objectContaining({ assistantId: 'crm-ops' }))
    })

    it('re-reads the winner after a unique-tuple race', async () => {
      const raced = bindingRecord({ id: 'binding-raced' })
      findBindingByScopeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(raced)
      insertBindingMock.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      )

      await expect(service.ensureBinding(identity)).resolves.toBe(raced)
      expect(findBindingByScopeMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('submit', () => {
    it('derives the idempotency key from identity + request hash and ensures the binding', async () => {
      const run = runRecord()
      submitMock.mockResolvedValueOnce({ run, replayed: false })

      const result = await service.submit({ identity, prompt: 'hello', requestHash: 'hash-1' })

      expect(result).toEqual({ run, replay: false })
      expect(insertBindingMock).toHaveBeenCalledTimes(1)
      expect(submitMock).toHaveBeenCalledWith({
        bindingId: 'id-1',
        userId: USER_ID,
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        idempotencyKey: defaultIdempotencyKey(identity, 'hash-1'),
        requestHash: 'hash-1',
        sessionId: null,
      })
    })

    it('hashes the prompt when no request hash is supplied', async () => {
      submitMock.mockResolvedValueOnce({ run: runRecord(), replayed: false })

      await service.submit({ identity, prompt: 'hello', bindingId: BINDING_ID })

      expect(submitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestHash: hashPrompt('hello'),
          idempotencyKey: defaultIdempotencyKey(identity, hashPrompt('hello')),
        }),
      )
    })

    it('preserves an explicit idempotency key and binding id', async () => {
      submitMock.mockResolvedValueOnce({ run: runRecord(), replayed: true })

      const result = await service.submit({
        identity,
        prompt: 'hello',
        requestHash: 'hash-1',
        idempotencyKey: 'client-key',
        bindingId: 'binding-explicit',
        sessionId: 'session-9',
      })

      expect(result.replay).toBe(true)
      expect(submitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          bindingId: 'binding-explicit',
          idempotencyKey: 'client-key',
          sessionId: 'session-9',
        }),
      )
      expect(findBindingByScopeMock).not.toHaveBeenCalled()
    })

    it('rejects an empty identity before touching the store', async () => {
      await expect(
        service.submit({ identity: { ...identity, userId: ' ' }, prompt: 'hello' }),
      ).rejects.toMatchObject({ code: 'invalid-request' })
      expect(submitMock).not.toHaveBeenCalled()
    })
  })

  describe('begin / appendEvent / finish', () => {
    it('delegates begin to the store with the runtime session id', async () => {
      const started = runRecord({ status: 'running', sessionId: 'dsh-session-9' })
      startMock.mockResolvedValueOnce(started)

      await expect(service.begin(RUN_ID, { sessionId: 'dsh-session-9' })).resolves.toBe(started)
      expect(startMock).toHaveBeenCalledWith(RUN_ID, { sessionId: 'dsh-session-9' })
    })

    it('allocates seq from the persisted cursor and appends through the store', async () => {
      getRunMock.mockResolvedValueOnce(runRecord({ status: 'running', cursor: 4 }))
      const event = eventRecord({ seq: 5, type: 'text', payloadJson: { type: 'text', content: 'hi' } })
      appendEventMock.mockResolvedValueOnce({ event, run: runRecord({ status: 'running', cursor: 5 }) })

      const appended = await service.appendEvent(RUN_ID, {
        type: 'text',
        payload: { type: 'text', content: 'hi' },
      })

      expect(appended).toBe(event)
      expect(appendEventMock).toHaveBeenCalledWith({
        runId: RUN_ID,
        seq: 5,
        type: 'text',
        payload: { type: 'text', content: 'hi' },
      })
    })

    it('fails append when the run does not exist', async () => {
      getRunMock.mockResolvedValueOnce(null)
      await expect(service.appendEvent(RUN_ID, { type: 'text' })).rejects.toBeInstanceOf(
        RunNotFoundError,
      )
      expect(appendEventMock).not.toHaveBeenCalled()
    })

    it('finishes with the terminal status, result and error supplied by the route', async () => {
      const finished = runRecord({ status: 'failed', error: 'boom', finishedAt: T0 })
      finishMock.mockResolvedValueOnce(finished)

      await expect(
        service.finish(RUN_ID, { status: 'failed', result: { finalResponse: '' }, error: 'boom' }),
      ).resolves.toBe(finished)
      expect(finishMock).toHaveBeenCalledWith({
        runId: RUN_ID,
        status: 'failed',
        result: { finalResponse: '' },
        error: 'boom',
      })
    })
  })

  describe('replay', () => {
    it('returns persisted events after the cursor for a terminal run', async () => {
      const run = runRecord({ status: 'completed', cursor: 3, finishedAt: T0 })
      const events = [eventRecord({ seq: 2 }), eventRecord({ id: 'event-3', seq: 3 })]
      getRunMock.mockResolvedValueOnce(run)
      eventsAfterMock.mockResolvedValueOnce(events)

      const result = await service.replay(USER_ID, RUN_ID, 1)

      expect(result).toEqual({ run, events, resumable: true })
      expect(eventsAfterMock).toHaveBeenCalledWith(RUN_ID, 1)
    })

    it('marks an in-flight run as not resumable', async () => {
      getRunMock.mockResolvedValueOnce(runRecord({ status: 'running', cursor: 2 }))
      eventsAfterMock.mockResolvedValueOnce([eventRecord({ seq: 1 })])

      const result = await service.replay(USER_ID, RUN_ID, 0)

      expect(result.resumable).toBe(false)
      expect(result.run.status).toBe('running')
    })

    it('refuses a run owned by another employee before reading its events', async () => {
      getRunMock.mockResolvedValueOnce(runRecord({ userId: 'user-2' }))

      const error = await service.replay(USER_ID, RUN_ID, 0).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(RunOwnershipError)
      expect(error).toMatchObject({ code: 'run-forbidden' })
      expect(eventsAfterMock).not.toHaveBeenCalled()
    })

    it('reports a missing run distinctly from a forbidden one', async () => {
      getRunMock.mockResolvedValueOnce(null)
      await expect(service.replay(USER_ID, RUN_ID, 0)).rejects.toBeInstanceOf(RunNotFoundError)
    })
  describe('getBinding', () => {
    it('reads the existing row without ever creating one', async () => {
      findBindingByScopeMock.mockResolvedValueOnce(bindingRecord())

      await expect(service.getBinding(identity)).resolves.toEqual(bindingRecord())
      expect(insertBindingMock).not.toHaveBeenCalled()
    })

    it('returns null when the employee has no binding', async () => {
      await expect(service.getBinding(identity)).resolves.toBeNull()
      expect(insertBindingMock).not.toHaveBeenCalled()
    })
  })

  describe('getRun / cancel', () => {
    it('returns the current run row', async () => {
      getRunMock.mockResolvedValueOnce(runRecord({ status: 'running' }))
      await expect(service.getRun(RUN_ID)).resolves.toMatchObject({ id: RUN_ID, status: 'running' })
    })

    it('rejects a blank run id', async () => {
      await expect(service.getRun('  ')).rejects.toMatchObject({ code: 'invalid-request' })
    })

    it('cancels an in-flight run with the given reason', async () => {
      getRunMock.mockResolvedValueOnce(runRecord({ status: 'running' }))
      finishMock.mockResolvedValueOnce(
        runRecord({ status: 'cancelled', error: 'user_cancelled', finishedAt: T0 }),
      )

      const cancelled = await service.cancel(RUN_ID, 'user_cancelled')

      expect(cancelled.status).toBe('cancelled')
      expect(finishMock).toHaveBeenCalledWith({
        runId: RUN_ID,
        status: 'cancelled',
        error: 'user_cancelled',
      })
    })

    it('defaults to user_cancelled when the reason is blank', async () => {
      getRunMock.mockResolvedValueOnce(runRecord({ status: 'queued' }))
      finishMock.mockResolvedValueOnce(runRecord({ status: 'cancelled', error: 'user_cancelled' }))

      await service.cancel(RUN_ID, '   ')

      expect(finishMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled', error: 'user_cancelled' }),
      )
    })

    it('returns an already-terminal run unchanged', async () => {
      getRunMock.mockResolvedValueOnce(runRecord({ status: 'completed' }))

      await expect(service.cancel(RUN_ID)).resolves.toMatchObject({ status: 'completed' })
      expect(finishMock).not.toHaveBeenCalled()
    })

    it('re-reads after a concurrent terminal transition instead of failing', async () => {
      getRunMock
        .mockResolvedValueOnce(runRecord({ status: 'running' }))
        .mockResolvedValueOnce(runRecord({ status: 'cancelled', error: 'principal_revoked' }))
      finishMock.mockRejectedValueOnce(new TerminalRunError(RUN_ID, 'cancelled'))

      await expect(service.cancel(RUN_ID, 'user_cancelled')).resolves.toMatchObject({
        status: 'cancelled',
        error: 'principal_revoked',
      })
    })

    it('reports a missing run', async () => {
      getRunMock.mockResolvedValueOnce(null)
      await expect(service.cancel(RUN_ID)).rejects.toBeInstanceOf(RunNotFoundError)
    })
  })

  describe('revokeBinding', () => {
    it('delegates to the store and returns its cancelled runs', async () => {
      const result = {
        binding: bindingRecord({ status: 'revoked' as const, revision: 2 }),
        cancelled: [runRecord({ status: 'cancelled' as const })],
        revokedAt: T0,
      }
      revokeBindingMock.mockResolvedValueOnce(result)

      await expect(service.revokeBinding(BINDING_ID, { reason: 'offboarding' })).resolves.toBe(result)
      expect(revokeBindingMock).toHaveBeenCalledWith(BINDING_ID, { reason: 'offboarding' })
    })
  })

  })
})
