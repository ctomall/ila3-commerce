import { describe, expect, it } from '@jest/globals'
import { buildMappingIndexes } from '../mappings'

type Row = { todoId?: string | null; interactionId?: string | null; id?: string }

describe('buildMappingIndexes', () => {
  it('indexes a page of mappings by todoId and interactionId', () => {
    const rows = [
      { id: 'a', todoId: 'todo-1', interactionId: 'int-1' },
      { id: 'b', todoId: 'todo-2', interactionId: 'int-2' },
    ] as unknown as Row[]
    const { byTodoId, byInteractionId } = buildMappingIndexes(rows as never)
    expect(byTodoId.get('todo-1')).toBe(rows[0])
    expect(byTodoId.get('todo-2')).toBe(rows[1])
    expect(byInteractionId.get('int-1')).toBe(rows[0])
    expect(byInteractionId.get('int-2')).toBe(rows[1])
  })

  it('keeps the first row per key, matching findOne semantics', () => {
    const rows = [
      { id: 'first', todoId: 'todo-1', interactionId: 'int-1' },
      { id: 'second', todoId: 'todo-1', interactionId: 'int-2' },
    ] as unknown as Row[]
    const { byTodoId, byInteractionId } = buildMappingIndexes(rows as never)
    expect((byTodoId.get('todo-1') as unknown as Row).id).toBe('first')
    expect((byInteractionId.get('int-2') as unknown as Row).id).toBe('second')
  })

  it('skips rows without usable keys', () => {
    const rows = [
      { id: 'empty' },
      { id: 'nullish', todoId: null, interactionId: null },
      { id: 'ok', todoId: 'todo-9', interactionId: 'int-9' },
    ] as unknown as Row[]
    const { byTodoId, byInteractionId } = buildMappingIndexes(rows as never)
    expect(byTodoId.size).toBe(1)
    expect(byInteractionId.size).toBe(1)
    expect(byTodoId.has('todo-9')).toBe(true)
  })
})
