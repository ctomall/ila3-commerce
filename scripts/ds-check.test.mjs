import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {scanDesignSystem} from './ds-check.mjs'
test('protocol prose is not an arbitrary CSS property, real properties still fail',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ds-policy-'))
 fs.mkdirSync(path.join(root,'src'))
 fs.writeFileSync(path.join(root,'src','fixture.tsx'), 'const body = `[postback:${payload ?? ""}]`; const node = <div className="[color:red] w-[20px]" />')
 const result=scanDesignSystem(root,{useIgnore:false})
 assert.equal(result.findings.length,2)
 assert.ok(result.findings.some(x=>x.match==='[color:red]'))
 assert.ok(result.findings.some(x=>x.match==='w-[20px]'))
})
