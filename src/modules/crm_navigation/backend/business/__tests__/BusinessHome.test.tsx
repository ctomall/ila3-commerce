/** @jest-environment jsdom */
import * as React from 'react'
import {describe,it,expect,jest} from '@jest/globals'
import {render,screen} from '@testing-library/react'
const catalog={version:2,groups:[{id:'sales',label:'Sales',order:1,landing:'/backend/sales',items:[{href:'/backend/sales',label:'Orders'}]},{id:'payments',label:'Payments',order:2,landing:'/backend/payments',items:[{href:'/backend/payments',label:'Payments'}]}],railActions:[],utility:[],manage:{categories:[]},personal:{items:[]}}
jest.mock('@open-mercato/ui/backend/BackendChromeProvider',()=>({useBackendChrome:()=>({payload:{crm:catalog},isLoading:false})}))
jest.mock('@open-mercato/shared/lib/i18n/context',()=>({useT:()=>((key:string,fallback:string)=>fallback)}))
jest.mock('next/link',()=>({__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}))
import BusinessHome from '../BusinessHome'
describe('business directory shared workspace composition',()=>{
 it('uses the same workspace grouping without losing legacy destinations',()=>{
  render(<BusinessHome/>)
  expect(screen.getByRole('heading',{name:'销售与收款'})).toBeTruthy()
  expect(screen.getByRole('link',{name:'Orders'}).getAttribute('href')).toBe('/backend/sales')
  expect(screen.getByRole('link',{name:'Payments'}).getAttribute('href')).toBe('/backend/payments')
 })
})
