/** @jest-environment jsdom */
import * as React from 'react'
import {describe,it,expect,jest,beforeEach} from '@jest/globals'
import {render,screen,fireEvent} from '@testing-library/react'
let mockPayload:unknown
const mockFavorite=jest.fn()
jest.mock('@open-mercato/ui/backend/BackendChromeProvider',()=>({useBackendChrome:()=>({payload:mockPayload})}))
jest.mock('@open-mercato/shared/lib/i18n/context',()=>({useT:()=>((key:string,fallback:string)=>fallback)}))
jest.mock('../NavigationPreferences',()=>({useNavigationPreferences:()=>({preference:{favorites:[]},toggleFavorite:mockFavorite})}))
jest.mock('next/link',()=>({__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}))
jest.mock('@open-mercato/ui/primitives/popover',()=>({Popover:({children}:{children:React.ReactNode})=><>{children}</>,PopoverTrigger:({children}:{children:React.ReactNode})=><>{children}</>,PopoverContent:({children}:{children:React.ReactNode})=><>{children}</>}))
import {NavigationSearch} from '../NavigationSearch'
const item=(href:string,label:string)=>({href,label})
const catalog={version:2,groups:[{id:'customers',label:'Customers',order:1,landing:'/backend/customers',items:[item('/backend/customers','Customers')]}],railActions:[],utility:[],manage:{categories:[{id:'system',label:'System',order:1,items:[item('/backend/system','System settings')]}]},personal:{items:[item('/backend/profile/password','Password')]}}
beforeEach(()=>{mockFavorite.mockClear();mockPayload={crm:catalog}})
describe('complete directory search consumer',()=>{
 it('searches business, settings and personal entries from the same authorized catalogue',()=>{
  render(<NavigationSearch/>)
  expect(screen.getByRole('link',{name:/Customers/})).toBeTruthy()
  expect(screen.getByRole('link',{name:/System settings/})).toBeTruthy()
  expect(screen.getByRole('link',{name:/Password/})).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Password'}})
  expect(screen.queryByRole('link',{name:/Customers/})).toBeNull()
  expect(screen.getByRole('link',{name:/Password/})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'收藏入口'}))
  expect(mockFavorite).toHaveBeenCalledWith('/backend/profile/password')
 })
 it('does not render unauthorized placeholders or rollback controls',()=>{
  mockPayload={crm:catalog,workspaceNavigationEnabled:false}
  render(<NavigationSearch/>)
  expect(screen.queryByRole('textbox')).toBeNull()
 })
 it('finds hidden workspace destinations by the organization label without widening authorization',()=>{
  mockPayload={crm:catalog,workspaceLayout:{version:1,order:[],hidden:['customers'],labels:{customers:'Organization clients'},presets:[],assignments:{}}}
  render(<NavigationSearch/>)
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Organization clients'}})
  expect(screen.getByRole('link',{name:/Organization clients/}).getAttribute('href')).toBe('/backend/customers')
  expect(screen.queryByRole('link',{name:/System settings/})).toBeNull()
 })

})
