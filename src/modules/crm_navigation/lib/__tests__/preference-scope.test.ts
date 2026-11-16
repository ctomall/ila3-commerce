import {describe,it,expect,jest} from '@jest/globals'
const mockResolve=jest.fn(async (_input: unknown)=>({scope:{tenantId:'selected-tenant',selectedId:null}}))
jest.mock('@open-mercato/shared/lib/di/container',()=>({createRequestContainer:async()=>({})}))
jest.mock('@open-mercato/core/modules/directory/utils/organizationScope',()=>({resolveFeatureCheckContext:mockResolve}))
import {resolveNavigationPreferenceScope} from '../preference-scope'
describe('trusted preference context',()=>{
 it('uses resolved selected tenant and preserves all-organizations null',async()=>{
  const auth={sub:'u',tenantId:'login-tenant',orgId:'login-org'}
  const req={} as never
  expect(await resolveNavigationPreferenceScope(req,auth as never)).toEqual({userId:'u',tenantId:'selected-tenant',organizationId:null})
  expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({auth,request:req}))
 })
})
