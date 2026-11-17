/** @jest-environment jsdom */
import * as React from 'react'
import {describe,it,expect,jest} from '@jest/globals'
import {render,screen} from '@testing-library/react'
let mockPath='/backend/records/create'
let mockLoading=false
jest.mock('next/navigation',()=>({usePathname:()=>mockPath}))
jest.mock('@open-mercato/shared/lib/i18n/context',()=>({useT:()=>((key:string,fallback:string,args:{name:string})=>fallback.replace('{name}',args.name))}))
jest.mock('@open-mercato/ui/backend/BackendChromeProvider',()=>({useBackendChrome:()=>({isLoading:mockLoading,payload:{crm:{version:2,railActions:[],utility:[],groups:[{items:[{href:'/backend/records',label:'Records'}]}],manage:{categories:[]},personal:{items:[]}}}})}))
jest.mock('next/link',()=>({__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}))
import {NavigationReturn} from '../NavigationReturn'
describe('contextual return affordance',()=>{
 it('links to an authorized parent without replacing breadcrumbs',()=>{
  const view=render(<NavigationReturn/>);
  expect(screen.getByRole('link',{name:'返回 Records'}).getAttribute('href')).toBe('/backend/records')
  mockPath='/backend/unknown/create';view.rerender(<NavigationReturn/>);
  expect(screen.queryByRole('link')).toBeNull()
 })
 it('does not expose stale links while scope is loading',()=>{
  mockPath='/backend/records/create';mockLoading=true;
  render(<NavigationReturn/>);expect(screen.queryByRole('link')).toBeNull();mockLoading=false;
 })
})
