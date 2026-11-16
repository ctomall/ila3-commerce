import { describe, it, expect } from '@jest/globals'
import { buildSettingsLevels } from '../settings-levels'
describe('settings hierarchy',()=>{
  it('groups authorized categories without introducing roles or entries',()=>{
    const categories=['users','system','third_party'].map(id=>({id,label:id,order:1,items:[{href:`/backend/${id}`,label:id}]}))
    const result=buildSettingsLevels(categories)
    expect(result.map(level=>level.id)).toEqual(['organization','platform','additional'])
    expect(result.flatMap(level=>level.categories)).toEqual(categories)
  })
  it('does not invent a platform section for a user without its entries',()=>{
    expect(buildSettingsLevels([])).toEqual([])
    expect(buildSettingsLevels([{id:'users',label:'Users',order:1,items:[]}]).map(level=>level.id)).toEqual(['organization'])
  })
})
