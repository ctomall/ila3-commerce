/** @jest-environment jsdom */
import * as React from 'react'
import {describe,it,expect,jest,beforeEach} from '@jest/globals'
import {render,screen,fireEvent} from '@testing-library/react'
const mockPush=jest.fn()
let mockPayload:unknown
jest.mock('next/navigation',()=>({usePathname:()=>'/backend/customers',useRouter:()=>({push:mockPush})}))
jest.mock('@open-mercato/ui/backend/BackendChromeProvider',()=>({useBackendChrome:()=>({payload:mockPayload,isLoading:false})}))
jest.mock('@open-mercato/shared/lib/i18n/context',()=>({useT:()=>((key:string,fallback:string)=>fallback)}))
jest.mock('../NavigationPreferences',()=>({useNavigationPreferences:()=>({preference:{recentWorkspace:null,favorites:[]}})}))
jest.mock('@open-mercato/ui/primitives/select',()=>({
 Select:({children,value,onValueChange}:{children:React.ReactNode;value:string;onValueChange:(value:string)=>void})=><select data-testid="select" value={value} onChange={event=>onValueChange(event.target.value)}>{children}</select>,
 SelectTrigger:()=>null,SelectValue:()=>null,SelectContent:({children}:{children:React.ReactNode})=><>{children}</>,SelectItem:({value,children}:{value:string;children:React.ReactNode})=><option value={value}>{children}</option>
}))
import {WorkspaceSwitcher} from '../WorkspaceSwitcher'
const catalog={version:2,groups:[{id:'customers',label:'Customers',order:1,landing:'/backend/customers',items:[{href:'/backend/customers',label:'Customers'}]},{id:'new_module',label:'New',order:2,landing:'/backend/new',items:[{href:'/backend/new',label:'New'}]}],railActions:[],utility:[],manage:{categories:[]},personal:{items:[]}}
beforeEach(()=>{mockPush.mockClear();mockPayload={crm:catalog,grantedFeatures:[]}})
describe('workspace selector consumer',()=>{
 it('discovers a new module and navigates only to its authorized landing',()=>{
  render(<WorkspaceSwitcher/>)
  fireEvent.change(screen.getByTestId('select'),{target:{value:'module:new_module'}})
  expect(mockPush).toHaveBeenCalledWith('/backend/new')
  expect(screen.queryByText('Forbidden')).toBeNull()
 })
 it('does not render in rollback mode',()=>{
  mockPayload={crm:catalog,workspaceNavigationEnabled:false}
  render(<WorkspaceSwitcher/>)
  expect(screen.queryByTestId('select')).toBeNull()
 })
 it('does not substitute a full menu for failed directory loads',()=>{
  mockPayload={crm:{...catalog,error:true}}
  render(<WorkspaceSwitcher/>)
  expect(screen.queryByTestId('select')).toBeNull()
 })
})
