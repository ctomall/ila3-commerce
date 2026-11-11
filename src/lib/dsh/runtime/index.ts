/**
 * Public seam for the CRM → DSH runtime adapter.
 *
 * The chat route imports `startDshRun` from here; transport-level tests and
 * tooling can use `createTransport`. All input/handle/result shapes live in
 * `types.ts` so the route can be built and mocked against a stable interface.
 */

export {
  DEFAULT_INITIALIZE_TIMEOUT_MS,
  DEFAULT_KILL_GRACE_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  DEFAULT_STOP_GRACE_MS,
  buildDshEnv,
  startDshRun,
  stopChildProcess,
} from './launch'
export type { DshSpawn, StartDshRunOptions, StopChildOptions } from './launch'

export {
  DEFAULT_REQUEST_TIMEOUT_MS as TRANSPORT_DEFAULT_REQUEST_TIMEOUT_MS,
  DshProtocolError,
  DshRequestTimeoutError,
  DshResponseError,
  DshTransportClosedError,
  createTransport,
} from './transport'
export type { CreateTransportOptions, DshTransport } from './transport'

export * from './types'
