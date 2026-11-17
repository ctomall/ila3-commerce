import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {extractRoutes,pagePlan,readMetadataLiteral,inventoryMarkdown,validateInventory,inspectComponent,extractDeclaredOverrides,traceLocalComponents} from './enterprise-inventory.mjs'
test('extracts exact paths and declared feature scope without executing metadata',()=>{
 const rows=extractRoutes(`const routes=[{moduleId:"customers",...resolvePageRouteMetadata("/backend/customers/[id]",({requireFeatures:["customers.view"],navHidden:true}))},{moduleId:"auth",...resolvePageRouteMetadata("/login",M.metadata)}]`)
 assert.equal(rows.length,2)
 assert.equal(rows[0].route,'/backend/customers/[id]')
 assert.deepEqual(rows[0].declared.requireFeatures,['customers.view'])
 assert.equal(rows[1].metadataStatus,'unresolved-reference')
})
test('layout classification is explicitly a suggestion, not runtime proof',()=>{
 assert.equal(pagePlan('/backend/records/create').layout,'CrudForm')
 assert.equal(pagePlan('/backend/records/[id]').status,'suggested-not-verified')
})

test('nested titles or features are not mistaken for page-level declarations',()=>{
 const [row]=extractRoutes('resolvePageRouteMetadata("/x",{requireAuth:true,nav:{title:"Nested",requireFeatures:["not-page"]}})')
 assert.equal(row.declared.requireAuth,true)
 assert.equal(row.declared.title,undefined)
 assert.equal(row.declared.requireFeatures,undefined)
})

test('records referenced metadata provenance without executing imports',()=>{
 const [row]=extractRoutes('import * as Ref from "@vendor/module/page.meta";const routes=[{moduleId:"catalog",...resolvePageRouteMetadata("/backend/catalog",Ref.metadata)}]')
 assert.equal(row.moduleId,'catalog')
 assert.deepEqual(row.metadataSources,['@vendor/module/page.meta'])
 assert.equal(row.metadataStatus,'unresolved-reference')
})
test('refuses a computed route rather than silently omitting it',()=>{
 assert.throws(()=>extractRoutes('resolvePageRouteMetadata(routeFromUser,{requireAuth:true})'),/Unresolved route/)
})

test('resolves literal metadata without executing icon calls or computed values',()=>{
 const result=readMetadataLiteral('const metadata={requireAuth:true,requireFeatures:["a.view"],pageTitle:"List",icon:dangerousCall(),breadcrumb:[{href:"/backend",label:"Home"}]}')
 assert.equal(result.metadata.requireAuth,true)
 assert.deepEqual(result.metadata.requireFeatures,['a.view'])
 assert.equal(result.metadata.breadcrumb[0].href,'/backend')
 assert.deepEqual(result.unresolved,['icon'])
})

test('markdown matrix escapes pipes and keeps unverifiable contracts unmapped',()=>{
 const markdown=inventoryMarkdown({sourceCommit:'abc',pages:[{surface:'backend',moduleId:'x',route:'/backend/x',declared:{pageTitle:'A|B'},plan:{title:'A|B',layout:'CrudForm',returnPath:'unresolved-parent',interaction:'inspect',states:[]},metadataStatus:'inline-declared',apiMapping:{status:'unmapped'}}],staticAppPages:[],staticAppApis:[],apis:[]})
 assert.ok(markdown.includes('A\\|B'))
 assert.ok(markdown.includes('unmapped'))
})

test('coverage checker rejects duplicate routes and unproven call mappings',()=>{
 const page={surface:'backend',moduleId:'x',route:'/backend/x',apiMapping:{status:'unmapped'},plan:{status:'suggested-not-verified'}}
 const base={counts:{backend:1,frontend:0,operations:0},pages:[page],apis:[]}
 assert.deepEqual(validateInventory(base),[])
 assert.ok(validateInventory({...base,pages:[page,page]}).includes('duplicate page route'))
 assert.ok(validateInventory({...base,pages:[{...page,apiMapping:{status:'confirmed'}}]}).some(x=>x.includes('unsubstantiated')))
})

test('records page loader and direct API literal provenance without assuming calls',()=>{
 const [row]=extractRoutes('const routes=[{moduleId:"x",...resolvePageRouteMetadata("/x",undefined),load:async()=>{const m=await import("@vendor/x/page");return m.default}}]')
 assert.equal(row.componentSpecifier,'@vendor/x/page')
 const result=inspectComponent('import X from "./X";const url="/api/x";const text="/not-api";','page.tsx')
 assert.equal(result.apiLiterals[0].status,'literal-reference-not-runtime-call')
 assert.deepEqual(result.imports,['./X'])
})

test('template APIs retain expressions and do not fabricate concrete identifiers',()=>{
 const result=inspectComponent('const url=`/api/records/${recordId}?limit=20`;','page.tsx')
 assert.equal(result.apiTemplates[0].expression,'`/api/records/${recordId}?limit=20`')
 assert.equal(result.apiTemplates[0].status,'template-reference-not-resolved')
 assert.equal(result.apiLiterals.length,0)
})

test('CRUD helper calls preserve relative paths and dynamic arguments',()=>{
 const result=inspectComponent('updateCrud("entities/records",payload);apiCall(`/api/records/${id}`);fetch(url);','page.tsx')
 assert.deepEqual(result.helperCalls.map(x=>x.helper),['updateCrud','apiCall','fetch'])
 assert.equal(result.helperCalls[0].argument,'"entities/records"')
 assert.equal(result.helperCalls[2].argument,'url')
})

test('preserves existing per-page navigation overrides separately from base metadata',()=>{
 const result=extractDeclaredOverrides('const declaredNavPages:Record<string,unknown>={"/backend/x":{key:"group",hidden:true,context:"settings"}}')
 assert.equal(result.metadata['/backend/x'].hidden,true)
 assert.equal(result.metadata['/backend/x'].key,'group')
})

test('bounded child tracing follows local files and does not execute them',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-trace-'))
 try {
  fs.writeFileSync(path.join(root,'page.tsx'),'import Child from "./Child";throw Error("must not execute")')
  fs.writeFileSync(path.join(root,'Child.tsx'),'apiCall("/api/x");')
  const trace=traceLocalComponents(path.join(root,'page.tsx'),root)
  assert.equal(trace.evidence.length,2)
  assert.equal(trace.evidence[1].calls[0].helper,'apiCall')
  const limited=traceLocalComponents(path.join(root,'page.tsx'),root,{maxFiles:1})
  assert.equal(limited.truncated,true)
 } finally {fs.rmSync(root,{recursive:true,force:true})}
})
