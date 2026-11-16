/** @jest-environment jsdom */
import * as React from 'react'
import {describe,it,expect,jest,beforeEach} from '@jest/globals'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
const mockWrite=jest.fn()
const mockRead=jest.fn(()=>({recentWorkspace:null,favorites:[]}))
let mockPayload:unknown
jest.mock('@open-mercato/ui/backend/BackendChromeProvider',()=>({useBackendChrome:()=>({payload:mockPayload})}))
jest.mock('next/navigation',()=>({usePathname:()=>'/backend/customers'}))
jest.mock('@open-mercato/shared/lib/browser/versionedPreference',()=>({readVersionedPreference:()=>mockRead(),writeVersionedPreference:(...args:unknown[])=>mockWrite(...args)}))
import { NavigationPreferences,useNavigationPreferences } from '../NavigationPreferences'
function Probe(){const {preference,toggleFavorite}=useNavigationPreferences();return <><output>{JSON.stringify(preference)}</output><button onClick={()=>toggleFavorite('/backend/customers')}>favorite</button></>}
const catalog={version:2,groups:[{id:'customers',label:'Customers',order:1,landing:'/backend/customers',items:[{href:'/backend/customers',label:'Customers'}]}],railActions:[],utility:[],manage:{categories:[]},personal:{items:[]}}
beforeEach(()=>{mockWrite.mockClear();mockPayload={crm:catalog,currentOrganization:{id:'org-a',name:'A'},navigationPreferenceScope:{userId:'u',tenantId:'t',organizationId:'org-a'}}})
describe('navigation preference integration',()=>{
 it('stores scoped references and changes preference namespace on organization switch',async()=>{
  const view=render(<NavigationPreferences userId="u" tenantId="t" organizationId="org-a"><Probe/></NavigationPreferences>)
  await waitFor(()=>expect(screen.getByText(/recentWorkspace/).textContent).toContain('customers'))
  fireEvent.click(screen.getByText('favorite'))
  await waitFor(()=>expect(mockWrite).toHaveBeenCalled())
  expect(mockWrite.mock.calls.at(-1)?.[0]).toContain('org-a')
  mockPayload={crm:catalog,currentOrganization:{id:'org-b',name:'B'},navigationPreferenceScope:{userId:'u',tenantId:'t',organizationId:'org-b'}}
  view.rerender(<NavigationPreferences userId="u" tenantId="t" organizationId="org-a"><Probe/></NavigationPreferences>)
  await waitFor(()=>expect(mockWrite.mock.calls.at(-1)?.[0]).toContain('org-b'))
  expect(screen.getByText(/recentWorkspace/).textContent).toContain('"favorites":[]')
 })
 it('removes saved favorites from the rendered view after permissions disappear',async()=>{
  const view=render(<NavigationPreferences userId="u" tenantId="t" organizationId="org-a"><Probe/></NavigationPreferences>)
  await waitFor(()=>expect(screen.getByText(/recentWorkspace/).textContent).toContain('customers'))
  fireEvent.click(screen.getByText('favorite'))
  expect(screen.getByText(/recentWorkspace/).textContent).toContain('/backend/customers')
  mockPayload={crm:{...catalog,groups:[]},currentOrganization:{id:'org-a',name:'A'},navigationPreferenceScope:{userId:'u',tenantId:'t',organizationId:'org-a'}}
  view.rerender(<NavigationPreferences userId="u" tenantId="t" organizationId="org-a"><Probe/></NavigationPreferences>)
  expect(screen.getByText(/recentWorkspace/).textContent).toBe('{"recentWorkspace":null,"favorites":[]}')
 })

 it('does not persist when trusted scope resolution is unavailable',async()=>{
  mockPayload={crm:catalog,navigationPreferenceScope:null}
  render(<NavigationPreferences userId="u" tenantId="t" organizationId="org-a"><Probe/></NavigationPreferences>)
  fireEvent.click(screen.getByText('favorite'))
  expect(mockWrite).not.toHaveBeenCalled()
 })

})
