import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateArtifact} from './artifact-contract.mjs'
const e={commit:'a'.repeat(40),sha256:'b'.repeat(64),repository:'ctomall/ila3-commerce',workflowRunId:123,nodeMajor:24,platform:'linux',arch:'x64'}
const m={schema:1,...e,runtime:{nodeMajor:24,platform:'linux',arch:'x64'},checks:['typecheck','unit','build'],database:{migrationRequired:false}}
test('valid immutable package',()=>assert.equal(validateArtifact(m,e).ok,true))
for(const [key,value] of [['commit','c'.repeat(40)],['sha256','d'.repeat(64)],['repository','other/repo'],['workflowRunId',456],['schema',2],['checks',['build']],['runtime',{nodeMajor:20}],['database',{migrationRequired:true}]])test('reject '+key,()=>assert.equal(validateArtifact({...m,[key]:value},e).ok,false))
test('absent manifest fails closed',()=>assert.equal(validateArtifact(null,e).ok,false))
