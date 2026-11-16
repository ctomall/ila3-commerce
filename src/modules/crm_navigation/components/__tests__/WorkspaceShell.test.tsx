/** @jest-environment jsdom */
import * as React from 'react'
import { describe,it,expect,jest } from '@jest/globals'
import { render,screen,act } from '@testing-library/react'
const mockPath=jest.fn(()=>'/backend/customers/companies')
jest.mock('next/navigation',()=>({usePathname:mockPath}))
jest.mock('@open-mercato/ui/backend/AppShell',()=>({AppShell:({adminNavApi,children}:{adminNavApi:string;children:React.ReactNode})=><div data-testid="shell" data-api={adminNavApi}>{children}</div>}))
import { emitOrganizationScopeChanged } from '@open-mercato/shared/lib/frontend/organizationEvents'
import { WorkspaceShell } from '../WorkspaceShell'
describe('public shell adapter',()=>{
  it('keeps children and selects a cache-distinct authorized nav request by actual path',()=>{
    const {rerender}=render(<WorkspaceShell groups={[]}><p>Business content</p></WorkspaceShell>)
    expect(screen.getByTestId('shell').getAttribute('data-api')).toBe('/api/crm_navigation/navigation?chrome=1&path=%2Fbackend%2Fcustomers%2Fcompanies&scope=0')
    expect(screen.getByText('Business content')).toBeTruthy()
    mockPath.mockReturnValue('/backend/sales/orders')
    rerender(<WorkspaceShell groups={[]}>Next</WorkspaceShell>)
    expect(screen.getByTestId('shell').getAttribute('data-api')).toContain('%2Fbackend%2Fsales%2Forders')
  })
 it('starts a fresh chrome scope key when organization changes',()=>{
  render(<WorkspaceShell groups={[]}>Content</WorkspaceShell>)
  act(()=>emitOrganizationScopeChanged({tenantId:'new-tenant',organizationId:'new-org'}))
  expect(screen.getByTestId('shell').getAttribute('data-api')).toContain('scope=1')
 })

 it('does not replace the shell for initial synchronization of the same trusted scope',()=>{
  render(<WorkspaceShell groups={[]} initialScope={{tenantId:'same-tenant',organizationId:'same-org'}}>Content</WorkspaceShell>)
  const before=screen.getByTestId('shell')
  const api=before.getAttribute('data-api')
  act(()=>emitOrganizationScopeChanged({tenantId:'same-tenant',organizationId:'same-org'}))
  expect(screen.getByTestId('shell')).toBe(before)
  expect(before.getAttribute('data-api')).toBe(api)
 })

})
