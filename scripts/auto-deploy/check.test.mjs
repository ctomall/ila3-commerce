import {test} from 'node:test'
import assert from 'node:assert/strict'
import {classify} from './check.mjs'
const base={dirty:false,ahead:0,behind:1,migration:false,ci:true}
for(const [over,expected] of [[{dirty:true},'blocked-worktree'],[{ahead:1},'blocked-local-ahead'],[{behind:0},'up-to-date'],[{migration:true},'blocked-migration'],[{ci:false},'waiting-ci'],[{},'ready-for-isolated-deployment']])test(expected,()=>assert.equal(classify({...base,...over}),expected))
