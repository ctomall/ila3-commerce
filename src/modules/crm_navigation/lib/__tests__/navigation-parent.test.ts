import { describe, it, expect } from '@jest/globals'
import { navigationParent } from '../navigation-parent'
import type { CrmCatalog } from '@/nav/crm-navigation'
const catalog = {groups:[{items:[{href:'/backend',label:'Home'},{href:'/backend/customers',label:'Customers'},{href:'/backend/customers/companies',label:'Companies'}]}],manage:{categories:[{items:[{href:'/backend/config/models',label:'Models'}]}]},personal:{items:[]}} as unknown as CrmCatalog
describe('safe contextual parent',()=>{
 it('selects closest authorized list for create/detail/edit',()=>{
  expect(navigationParent(catalog,'/backend/customers/companies/create')?.href).toBe('/backend/customers/companies')
  expect(navigationParent(catalog,'/backend/customers/companies/abc/edit')?.label).toBe('Companies')
 })
 it('rejects root, exact list, unknown path and segment collisions',()=>{
  expect(navigationParent(catalog,'/backend')).toBeNull()
  expect(navigationParent(catalog,'/backend/customers')).toBeNull()
  expect(navigationParent(catalog,'/backend/customers-fake/abc')).toBeNull()
  expect(navigationParent(catalog,'/backend/secret/abc')).toBeNull()
 })
 it('works for nested settings without inventing a URL',()=>{
  expect(navigationParent(catalog,'/backend/config/models/abc')?.href).toBe('/backend/config/models')
  expect(navigationParent(null,'/backend/config/models/abc')).toBeNull()
  expect(navigationParent({...catalog,error:true},'/backend/config/models/abc')).toBeNull()
 })
})
