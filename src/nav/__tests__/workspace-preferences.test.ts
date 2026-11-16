import { describe, it, expect } from '@jest/globals'
import { navigationPreferenceKey, isNavigationPreference, sanitizeNavigationPreference } from '../workspace-preferences'
import { buildWorkspaces } from '../workspaces'
describe('scoped navigation preferences', () => {
  it('isolates users, tenants, organizations and delimiter-containing values', () => {
    const scopes = [['a','b','c'],['d','b','c'],['a','d','c'],['a','b','d'],['a:b','c','d'],['a','b:c','d']]
    expect(new Set(scopes.map(([u,t,o])=>navigationPreferenceKey(u,t,o))).size).toBe(scopes.length)
  })
  it('validates the version envelope data without accepting arbitrary favorite shapes', () => {
    expect(isNavigationPreference({recentWorkspace:null,favorites:[]})).toBe(true)
    expect(isNavigationPreference({recentWorkspace:1,favorites:[]})).toBe(false)
    expect(isNavigationPreference({recentWorkspace:null,favorites:[{}]})).toBe(false)
  })
  it('removes revoked or foreign references and never restores them from a saved label', () => {
    const spaces=buildWorkspaces([{id:'customers',label:'Customers',order:1,landing:'/backend/customers',items:[{href:'/backend/customers',label:'Customers'}]}])
    expect(sanitizeNavigationPreference({recentWorkspace:'forbidden',favorites:['/backend/admin','/backend/customers','/backend/customers']},spaces)).toEqual({recentWorkspace:null,favorites:['/backend/customers']})
    expect(sanitizeNavigationPreference({recentWorkspace:'customers',favorites:['/backend/customers']},[])).toEqual({recentWorkspace:null,favorites:[]})
  })
})
