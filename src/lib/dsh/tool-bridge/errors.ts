/**
 * Typed execution errors for bridge tools.
 *
 * The bridge route maps these to the stable HTTP contract instead of answering
 * 503 for a refusal the model can act on. Anything that is not a
 * `ToolExecutionError` is a real failure and stays 503 `tool_unavailable` so a
 * driver message never reaches the model.
 */
export type ToolExecutionErrorCode =
  | 'not_found'
  | 'invalid_input'
  | 'scope_denied'
  | 'command_rejected'

export class ToolExecutionError extends Error {
  readonly code: ToolExecutionErrorCode
  readonly status: 400 | 403 | 404

  constructor(code: ToolExecutionErrorCode, status: 400 | 403 | 404, message: string) {
    super(message)
    this.name = 'ToolExecutionError'
    this.code = code
    this.status = status
  }
}

export function isToolExecutionError(error: unknown): error is ToolExecutionError {
  return error instanceof ToolExecutionError
}
