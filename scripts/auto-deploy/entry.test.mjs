import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateRequest,legacyState} from './entry.mjs'
const now=Date.now(),base={requestedAt:new Date(now).toISOString(),ref:'main'}
test('main accepted',()=>assert.equal(validateRequest(base,now),'main'))
test('force refused',()=>assert.throws(()=>validateRequest({...base,force:true},now)))
test('expired refused',()=>assert.throws(()=>validateRequest(base,now+700000)))
test('arbitrary branch refused',()=>assert.throws(()=>validateRequest({...base,ref:'evil'},now)))
test('full SHA accepted syntactically',()=>assert.equal(validateRequest({...base,ref:'a'.repeat(40)},now),'a'.repeat(40)))
test('failure never appears succeeded',()=>assert.equal(legacyState(1,'x','test').status,'failed'))
