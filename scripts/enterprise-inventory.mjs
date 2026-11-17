import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

export function extractRoutes(text, file = 'metadata.ts') {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const rows = []
  const imports = new Map()
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamespaceImport(statement.importClause.namedBindings)) {
      imports.set(statement.importClause.namedBindings.name.text, statement.moduleSpecifier.text)
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'resolvePageRouteMetadata') {
      const [route, metadata] = node.arguments
      if (!route || !ts.isStringLiteral(route)) throw new Error('Unresolved route expression')
      const fields = {}
      let literal = metadata
      while (literal && (ts.isParenthesizedExpression(literal) || ts.isAsExpression(literal) || ts.isSatisfiesExpression(literal))) literal = literal.expression
      if (literal && ts.isObjectLiteralExpression(literal)) {
        for (const property of literal.properties) {
          if (!ts.isPropertyAssignment(property)) continue
          const key = property.name.getText(source).replace(/^['"]|['"]$/g, '')
          if (!['requireFeatures', 'requireCustomerFeatures', 'requireAuth', 'requireCustomerAuth', 'pageTitle', 'title', 'pageContext', 'navHidden'].includes(key)) continue
          const raw = property.initializer
          if (ts.isStringLiteral(raw)) fields[key] = raw.text
          else if (raw.kind === ts.SyntaxKind.TrueKeyword || raw.kind === ts.SyntaxKind.FalseKeyword) fields[key] = raw.kind === ts.SyntaxKind.TrueKeyword
          else if (ts.isArrayLiteralExpression(raw) && raw.elements.every(ts.isStringLiteral)) fields[key] = raw.elements.map(x => x.text)
        }
      }
      if (literal && ts.isObjectLiteralExpression(literal)) {
        const parsed = readMetadataLiteral('const metadata=' + literal.getText(source))
        Object.assign(fields, parsed.metadata ?? {})
      }
      const owner = node.parent?.parent
      let moduleId = null
      if (owner && ts.isObjectLiteralExpression(owner)) {
        const property = owner.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'moduleId')
        if (property && ts.isStringLiteral(property.initializer)) moduleId = property.initializer.text
      }
      let componentSpecifier = null
      if (owner && ts.isObjectLiteralExpression(owner)) {
        const loader = owner.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'load')
        function inspectLoader(value) {
          if (ts.isCallExpression(value) && value.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(value.arguments[0])) componentSpecifier = value.arguments[0].text
          ts.forEachChild(value,inspectLoader)
        }
        if (loader) inspectLoader(loader)
      }
      rows.push({ componentSpecifier, route: route.text, moduleId, declared: fields, metadataExpression: metadata?.getText(source) ?? null,
        metadataSources: [...imports].filter(([name]) => metadata?.getText(source).includes(name)).map(([,specifier]) => specifier),
        metadataStatus: Object.keys(fields).length ? 'inline-declared' : 'unresolved-reference', verification: 'not-exercised' })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return rows
}

/** Static evaluator: literals only; never executes imported metadata code. */
export function readMetadataLiteral(text) {
  const source = ts.createSourceFile('page.meta.ts', text, ts.ScriptTarget.Latest, true)
  const declarations = new Map()
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration.initializer)
    }
  }
  const unresolved = []
  function value(node, depth = 0) {
    if (!node || depth > 12) return undefined
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return value(node.expression, depth + 1)
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (node.kind === ts.SyntaxKind.NullKeyword) return null
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['apiCall','readApiResultOrThrow','createCrud','updateCrud','deleteCrud','fetch','selfFetch'].includes(node.expression.text)) {
      const argument=node.arguments[0]
      helperCalls.push({helper:node.expression.text,argument:argument?.getText(source)??null,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,status:'call-site-not-exercised'})
    }
    if (ts.isTemplateExpression(node) && node.head.text.startsWith('/api/')) {
      apiTemplates.push({expression:node.getText(source),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,status:'template-reference-not-resolved'})
    }
    if (ts.isIdentifier(node) && declarations.has(node.text)) return value(declarations.get(node.text), depth + 1)
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(x => value(x,depth+1))
    if (ts.isObjectLiteralExpression(node)) {
      const result = {}
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) { unresolved.push(property.getText(source)); continue }
        const key = property.name.getText(source).replace(/^['"]|['"]$/g,'')
        const resolved = value(property.initializer,depth+1)
        if (resolved !== undefined) result[key] = resolved
        else unresolved.push(key)
      }
      return result
    }
    return undefined
  }
  const metadata = value(declarations.get('metadata'))
  return { metadata: metadata ?? null, unresolved }
}

export function extractDeclaredOverrides(text) {
  const source=ts.createSourceFile('modules.ts',text,ts.ScriptTarget.Latest,true)
  let literal=null
  function visit(node) {
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='declaredNavPages') literal=node.initializer
    ts.forEachChild(node,visit)
  }
  visit(source)
  return literal ? readMetadataLiteral('const metadata='+literal.getText(source)) : {metadata:null,unresolved:['declaredNavPages']}
}

function enrichReferences(rows, root, generatedFile) {
  for (const row of rows) {
    if (!row.metadataSources.length) continue
    row.metadataReferences = []
    for (const specifier of row.metadataSources) {
      let file
      try {
        if (specifier.startsWith('.')) {
          const base = path.resolve(path.dirname(generatedFile),specifier)
          file = ['','.ts','.tsx','.js','.mjs'].map(ext=>base+ext).find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile())
        } else file = fileURLToPath(import.meta.resolve(specifier))
        if (!file || fs.statSync(file).size > 1024*1024) throw Error('missing or oversized reference')
        const parsed = readMetadataLiteral(fs.readFileSync(file,'utf8'))
        row.metadataReferences.push({ source:path.relative(root,file), unresolved:parsed.unresolved })
        if (parsed.metadata) { row.declared={...parsed.metadata,...row.declared}; row.metadataStatus=parsed.unresolved.length?'reference-partially-resolved':'reference-declared' }
      } catch (error) { row.metadataReferences.push({specifier,error:error.message}) }
    }
  }
  return rows
}

export function inspectComponent(text, file) {
  const source = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  const imports = []
  const helperCalls = []
  const apiLiterals = []
  const apiTemplates = []
  const guards = []
  const components = []
  function inspect(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text)
      const names=node.importClause?.namedBindings
      if (names && ts.isNamedImports(names)) for (const item of names.elements) {
        const name=(item.propertyName??item.name).text
        if (['Card','Page','PageBody','DataTable','CrudForm','ErrorMessage','LoadingMessage','EmptyState','Alert'].includes(name)) components.push(name)
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.startsWith('/api/')) apiLiterals.push({path:node.text,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,status:'literal-reference-not-runtime-call'})
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['apiCall','readApiResultOrThrow','createCrud','updateCrud','deleteCrud','fetch','selfFetch'].includes(node.expression.text)) {
      const argument=node.arguments[0]
      helperCalls.push({helper:node.expression.text,argument:argument?.getText(source)??null,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,status:'call-site-not-exercised'})
    }
    if (ts.isTemplateExpression(node) && node.head.text.startsWith('/api/')) {
      apiTemplates.push({expression:node.getText(source),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,status:'template-reference-not-resolved'})
    }
    if (ts.isIdentifier(node) && ['getAuthFromRequest','getAuthFromCookies','requireCustomerAuth','getCustomerAuth','authorizeFeatures'].includes(node.text)) guards.push(node.text)
    ts.forEachChild(node,inspect)
  }
  inspect(source)
  return {imports:[...new Set(imports)],components:[...new Set(components)],apiLiterals,apiTemplates,helperCalls,guardSymbols:[...new Set(guards)]}
}

function resolveComponent(specifier,root,generatedFile) {
  if (!specifier) return null
  if (!specifier.startsWith('.')) return fileURLToPath(import.meta.resolve(specifier))
  const base=path.resolve(path.dirname(generatedFile),specifier)
  return ['','.tsx','.ts','.js','.mjs'].map(ext=>base+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())??null
}

/** Bounded local dependency tracing; no package-wide scans or import execution. */
export function traceLocalComponents(file, root, options = {}) {
  const maxFiles=options.maxFiles??40
  const maxDepth=options.maxDepth??3
  const visited=new Set()
  const evidence=[]
  const unresolved=[]
  const queue=[{file,depth:0}]
  while(queue.length && visited.size<maxFiles) {
    const current=queue.shift()
    if(visited.has(current.file)) continue
    visited.add(current.file)
    if(!current.file.startsWith(root+path.sep)) { unresolved.push({source:current.file,reason:'outside-root'});continue }
    if(fs.statSync(current.file).size>1024*1024) {unresolved.push({source:path.relative(root,current.file),reason:'size-limit'});continue}
    const facts=inspectComponent(fs.readFileSync(current.file,'utf8'),current.file)
    evidence.push({source:path.relative(root,current.file),depth:current.depth,components:facts.components,calls:facts.helperCalls,templates:facts.apiTemplates})
    for(const specifier of facts.imports) {
      if(!specifier.startsWith('.') && !specifier.startsWith('@/')) continue
      if(current.depth>=maxDepth){unresolved.push({source:path.relative(root,current.file),specifier,reason:'depth-limit'});continue}
      const base=specifier.startsWith('@/')?path.join(root,'src',specifier.slice(2)):path.resolve(path.dirname(current.file),specifier)
      const extensions=['','.tsx','.ts','.js','.mjs','/index.tsx','/index.ts','/index.js']
      const resolved=extensions.map(ext=>base+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())
      if(resolved && !resolved.endsWith('.json'))queue.push({file:resolved,depth:current.depth+1})
      else unresolved.push({source:path.relative(root,current.file),specifier,reason:'not-resolved'})
    }
  }
  return {status:'bounded-static-evidence-not-runtime',evidence,unresolved,truncated:queue.length>0,maxFiles,maxDepth}
}

export function pagePlan(route) {
  const detail = /\[[^/]+\]/.test(route)
  const edit = /\/(create|new|edit)(\/|$)/.test(route)
  return { layout: edit ? 'CrudForm' : detail ? 'detail-with-related-records' : 'inspect-existing-surface',
    status: 'suggested-not-verified', states: ['loading','empty','error','forbidden','conflict','narrow','light','dark'],
    returnPath: 'resolve-from-declared-breadcrumb', interaction: edit ? 'validate-save-or-cancel-to-parent' : 'inspect-actions-and-resource-scope' }
}

export function buildInventory(root) {
  const generated = path.join(root, '.mercato/generated')
  const back = extractRoutes(fs.readFileSync(path.join(generated, 'backend-route-metadata.generated.ts'), 'utf8'))
  const front = extractRoutes(fs.readFileSync(path.join(generated, 'frontend-routes.generated.ts'), 'utf8'))
  const loaders = extractRoutes(fs.readFileSync(path.join(generated,'backend-routes.generated.ts'),'utf8'))
  const byRoute = new Map(loaders.map(row=>[row.route,row.componentSpecifier]))
  for (const row of back) row.componentSpecifier = byRoute.get(row.route) ?? null
  enrichReferences(back,root,path.join(generated,'backend-route-metadata.generated.ts'))
  enrichReferences(front,root,path.join(generated,'frontend-routes.generated.ts'))
  const navOverrides=extractDeclaredOverrides(fs.readFileSync(path.join(root,'src/modules.ts'),'utf8'))
  for (const row of back) row.navigationOverride=navOverrides.metadata?.[row.route]??null
  const doc = JSON.parse(fs.readFileSync(path.join(generated, 'openapi.generated.json'), 'utf8'))
  const apis = []
  for (const [route, methods] of Object.entries(doc.paths ?? {})) {
    for (const [method, spec] of Object.entries(methods)) {
      if (!['get','post','put','patch','delete','head','options'].includes(method)) continue
      apis.push({ route, method: method.toUpperCase(), operationId: spec.operationId ?? null,
        tags: spec.tags ?? [], security: spec.security ?? doc.security ?? [],
        requestSchema: spec.requestBody?.content?.['application/json']?.schema ?? null,
        responseStatuses: Object.keys(spec.responses ?? {}), verification: 'declared-not-exercised' })
    }
  }
  const staticAppPages = []
  const staticAppApis = []
  const appRoot = path.join(root, 'src/app')
  function scanApp(directory) {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const absolute = path.join(directory,entry.name)
      if (entry.isDirectory()) { scanApp(absolute); continue }
      if (!['page.tsx','page.ts','route.ts'].includes(entry.name)) continue
      const relative = path.relative(appRoot,directory).split(path.sep)
      const route = '/' + relative.filter(part => !/^\(.*\)$/.test(part)).join('/')
      const row = {route:route || '/',source:path.relative(root,absolute),verification:'declared-not-exercised'}
      if (entry.name === 'route.ts') staticAppApis.push(row)
      else staticAppPages.push(row)
    }
  }
  scanApp(appRoot)
  let sourceCommit = null
  try { sourceCommit = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim() } catch { /* Non-Git fixtures retain explicit null. */ }
  const pages = [...back.map(r => ({ ...r, surface: 'backend' })), ...front.map(r => ({ ...r, surface: 'frontend' }))]
    .map(row => ({ ...row, plan: { ...pagePlan(row.route), returnPath: row.declared.breadcrumb?.filter(item=>item?.href).at(-1)?.href ?? 'unresolved-parent', title: row.declared.pageTitle ?? row.declared.title ?? 'inspect-page-component', functions:'inspect-real-actions-before-implementation' }, apiMapping: { status: 'unmapped', reason: 'module or path similarity is not call-site evidence' } }))
  for (const page of pages) {
    try {
      const file=resolveComponent(page.componentSpecifier,root,path.join(generated,page.surface==='backend'?'backend-routes.generated.ts':'frontend-routes.generated.ts'))
      if (!file || fs.statSync(file).size>1024*1024) continue
      page.componentSource=path.relative(root,file)
      page.dependencyTrace=traceLocalComponents(file,root)
      page.componentEvidence=inspectComponent(fs.readFileSync(file,'utf8'),file)
      page.plan.existingComponentImports=page.componentEvidence.components
      if (page.componentEvidence.apiLiterals.length || page.componentEvidence.apiTemplates.length || page.componentEvidence.helperCalls.length) page.apiMapping={status:'source-literals-only',references:page.componentEvidence.apiLiterals,templates:page.componentEvidence.apiTemplates,calls:page.componentEvidence.helperCalls,reason:'literal provenance is not runtime call verification'}
    } catch(error) {page.componentResolutionError=error.message}
  }
  if (new Set(pages.map(p => p.surface + ':' + p.route)).size !== pages.length) throw new Error('Duplicate declared route')
  return { schemaVersion: 1, sourceCommit, inputDigests:Object.fromEntries(['backend-route-metadata.generated.ts','backend-routes.generated.ts','frontend-routes.generated.ts','openapi.generated.json'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(generated,name))).digest('hex')])), navigationOverrides:{status:'declared-not-runtime-merged',unresolved:navOverrides.unresolved}, scope: 'generated-module-and-static-app-routes', staticAppPages, staticAppApis,
    counts: { backend: back.length, frontend: front.length, operations: apis.length, unresolved: pages.filter(p => p.metadataStatus === 'unresolved-reference').length }, pages, apis }
}

export function validateInventory(data) {
  const errors = []
  if (data.pages.length !== data.counts.backend + data.counts.frontend) errors.push('page count mismatch')
  if (data.apis.length !== data.counts.operations) errors.push('operation count mismatch')
  if (new Set(data.pages.map(p=>p.surface+':'+p.route)).size !== data.pages.length) errors.push('duplicate page route')
  if (new Set(data.apis.map(p=>p.method+':'+p.route)).size !== data.apis.length) errors.push('duplicate API operation')
  for (const page of data.pages) {
    if (!page.route.startsWith('/') || !page.moduleId) errors.push('invalid page identity: '+page.route)
    if (!['unmapped','source-literals-only'].includes(page.apiMapping.status)) errors.push('unsubstantiated call mapping: '+page.route)
    if (page.plan.status !== 'suggested-not-verified') errors.push('unsubstantiated layout: '+page.route)
  }
  return errors
}

export function inventoryMarkdown(data) {
  const clean = value => String(value ?? '').replaceAll('|','\\|').replaceAll('\n',' ')
  const rows = ['# 企业模块页面与契约基线','',
    '源提交：`'+data.sourceCommit+'`。声明不等于运行验收；建议布局不是现状。页面API未查调用点时明确未映射。','',
    '| 范围 | 模块 | 路由 | 标题 | 声明权限 | 建议布局 | 返回父页 | 元数据证据 | 调用证据 |',
    '|---|---|---|---|---|---|---|---|---|']
  for (const page of data.pages) rows.push('| '+[page.surface,page.moduleId,page.route,page.plan.title,
    (page.declared.requireFeatures??page.declared.requireCustomerFeatures??[]).join(',')||'未声明/待验证',page.plan.layout,
    page.plan.returnPath,page.metadataStatus,page.apiMapping.status].map(clean).join(' | ')+' |')
  rows.push('','## 逐页源码与接口引用证据','')
  for (const page of data.pages) {
    rows.push('### `'+page.route+'`','', '- 源文件：`'+(page.componentSource??'unresolved')+'`',
      '- 导航覆盖：'+(page.navigationOverride?JSON.stringify(page.navigationOverride):'无；沿用模块声明'),
      '- 现有组件导入：'+(page.componentEvidence?.components.join(', ')||'未直接导入/检查子组件'),
      '- 交互计划：'+page.plan.interaction+'；返回：'+page.plan.returnPath,
      '- 状态验收：'+page.plan.states.join(', ')+'（均待运行验证）')
    if (page.dependencyTrace) {
      rows.push('- 子组件追踪：'+page.dependencyTrace.evidence.length+'文件；截断：'+page.dependencyTrace.truncated+'（静态证据）')
      for (const child of page.dependencyTrace.evidence.filter(e=>e.depth>0)) for (const call of child.calls) rows.push('- 子组件请求 `'+child.source+':'+call.line+'`：'+call.helper+'('+clean(call.argument)+')，未运行验证。')
    }
    for (const reference of page.apiMapping.references??[]) rows.push('- API字面量 L'+reference.line+'：`'+reference.path+'`，未证实运行调用')
    for (const reference of page.apiMapping.templates??[]) rows.push('- API模板 L'+reference.line+'：'+clean(reference.expression)+'，动态部分待绑定')
    for (const call of page.apiMapping.calls??[]) rows.push('- 请求调用 L'+call.line+'：'+call.helper+'('+clean(call.argument)+')；尚未运行验证。')
    if (page.apiMapping.status==='unmapped') rows.push('- 契约：未映射，需跟踪子组件/helper，不按模块猜测。')
    rows.push('')
  }
  rows.push('','## 独立应用壳路由（可能覆盖模块声明）','')
  for (const page of data.staticAppPages) rows.push('- `'+page.route+'` → `'+page.source+'`')
  rows.push('','## 独立API Handler（不等于全部OpenAPI操作）','')
  for (const api of data.staticAppApis) rows.push('- `'+api.route+'` → `'+api.source+'`')
  rows.push('','## 后端操作目录','', '| 方法 | 路径 | operationId | 响应码 |','|---|---|---|---|')
  for (const api of data.apis) rows.push('| '+[api.method,api.route,api.operationId,api.responseStatuses.join(',')].map(clean).join(' | ')+' |')
  return rows.join('\n')+'\n'
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = process.cwd()
  const output = process.argv[2]
  if (!output) throw new Error('Explicit output path required')
  const data = buildInventory(root)
  const errors = validateInventory(data)
  if (errors.length) throw new Error(errors.join('; '))
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n')
  fs.writeFileSync(output.replace(/\.json$/, '') + '.md', inventoryMarkdown(data))
  console.log(JSON.stringify(data.counts))
}
