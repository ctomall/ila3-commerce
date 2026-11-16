/** @jest-environment jsdom */
import * as React from 'react'
import {describe,it,expect,jest} from '@jest/globals'
import {render,screen,waitFor,fireEvent} from '@testing-library/react'
jest.mock('@open-mercato/shared/lib/i18n/context',()=>({useT:()=>((key:string,fallback:string)=>fallback)}))
jest.mock('@open-mercato/ui/backend/utils/apiCall',()=>({apiCall:async(url:string)=>({ok:true,result:url.includes('/ai/agents')?{agents:[{id:'test.agent',moduleId:'crm',label:'Test agent',description:'Description',executionMode:'chat',readOnly:true,mutationPolicy:'read-only',maxSteps:3,tools:[],defaultModel:'base',defaultProvider:'provider'}]}:{agents:[{agentId:'test.agent',providerId:'override-provider',modelId:'override-model',source:'tenant_override'}]}})}))
jest.mock('@open-mercato/ui/backend/DataTable',()=>({DataTable:({data,columns,isLoading,error,emptyState}:{data:unknown[];columns:Array<{id:string;cell:(ctx:{row:{original:unknown}})=>React.ReactNode}>;isLoading:boolean;error:string;emptyState:React.ReactNode})=><div>{isLoading?'Loading':error||(!data.length?emptyState:data.map((row,i)=><div key={i}>{columns.map(c=><div key={c.id}>{c.cell({row:{original:row}})}</div>)}</div>))}</div>}))
jest.mock('next/link',()=>({__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}))
import AgentDirectoryClient from '../AgentDirectoryClient'
describe('agent directory DataTable migration',()=>{
 it('preserves model resolution, configuration actions and search filtering',async()=>{
  render(<AgentDirectoryClient/>)
  await waitFor(()=>expect(screen.getByText('Test agent')).toBeTruthy())
  expect(screen.getByText('override-provider / override-model')).toBeTruthy()
  expect(screen.getByRole('link',{name:/Configure/}).getAttribute('href')).toBe('/backend/config/ai-assistant/agents')
  fireEvent.change(screen.getByRole('textbox',{name:'Search agents…'}),{target:{value:'no match'}})
  expect(screen.getByText('No agents match the filters.')).toBeTruthy()
 })
})
