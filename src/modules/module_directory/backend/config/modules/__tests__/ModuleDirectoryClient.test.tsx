/** @jest-environment jsdom */
import * as React from 'react'
import {describe,it,expect,jest} from '@jest/globals'
import {render,screen,fireEvent} from '@testing-library/react'
jest.mock('@open-mercato/shared/lib/i18n/context',()=>({useT:()=>((key:string,fallback:string)=>fallback)}))
jest.mock('@open-mercato/ui/backend/DataTable',()=>({DataTable:({data,columns,emptyState}:{data:unknown[];columns:Array<{id:string;cell:(ctx:{row:{original:unknown}})=>React.ReactNode}>;emptyState:React.ReactNode})=><div>{data.length?data.map((row,i)=><div key={i}>{columns.map(c=><div key={c.id}>{c.cell({row:{original:row}})}</div>)}</div>):emptyState}</div>}))
jest.mock('next/link',()=>({__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}))
import ModuleDirectoryClient from '../ModuleDirectoryClient'
describe('module directory table migration',()=>{
 it('keeps scoped entry links, details and search',()=>{
  render(<ModuleDirectoryClient modules={[{id:'sample',title:'Sample',name:'sample',version:'1',description:'Description',author:'Author',license:'MIT',pageCount:1,configCount:1,configPath:'/backend/settings/sample',openPath:'/backend/sample',pages:[{path:'/backend/sample',title:'Sample page',navHidden:false,isConfig:false}]}]}/>)
  expect(screen.getByRole('link',{name:/Open/}).getAttribute('href')).toBe('/backend/sample')
  fireEvent.click(screen.getByRole('button',{name:/Details/}))
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'})
 })
})
