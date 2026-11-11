import { describe, expect, it } from '@jest/globals'
import metadata, { DshAssistantBinding, DshRun, DshRunEvent, entities, features } from '../index'

describe('dsh_runs module declaration', () => {
  it('declares the persistence module and its three entities without UI routes', () => {
    expect(metadata.name).toBe('dsh_runs')
    expect(metadata.title).toBe('DSH Runs')
    expect(entities).toHaveLength(3)
    expect(entities.map((entity) => entity.name)).toEqual([
      'DshAssistantBinding',
      'DshRun',
      'DshRunEvent',
    ])
    expect(DshAssistantBinding.name).toBe('DshAssistantBinding')
    expect(DshRun.name).toBe('DshRun')
    expect(DshRunEvent.name).toBe('DshRunEvent')
  })

  it('declares the feature ids the API can gate on', () => {
    expect(features.map((feature) => feature.id)).toEqual(['dsh_runs.view', 'dsh_runs.cancel'])
  })
})
