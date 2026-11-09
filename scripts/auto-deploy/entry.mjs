/** Unified entry for legacy UI and automatic timer; never resets source. */
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {APP_DIR, CURRENT_LINK, STATE_DIR, gitOut, writeJsonAtomic} from './lib.mjs'
export function validateRequest(request, now=Date.now()) {
 if(request.force) throw Error('Force updates are no longer supported; use the gated release pipeline')
 const at=Date.parse(request.requestedAt)
 if(!Number.isFinite(at)||at>now+60000||now-at>600000)throw Error('Upgrade request expired; submit a new request')
 const ref=request.ref||'main'
 if(!['main','origin/main','refs/heads/main'].includes(ref)&&! /^[0-9a-f]{40}$/.test(ref))throw Error('Only main or a full SHA reachable from origin/main is allowed')
 return ref
}
export function legacyState(result, sha, actor){
 return {status:result===0?'succeeded':'failed',step:result===0?'isolated-deploy-complete':'isolated-deploy-failed',toCommit:sha,actor,finishedAt:new Date().toISOString(),message:'Unified isolated executor; see deployment run records for authoritative result'}
}
async function main(){
 const manual=process.argv.includes('--legacy-ui'), dry=process.argv.includes('--dry-run')
 const current=fs.realpathSync(CURRENT_LINK)
 const dirs=[path.join(current,'.mercato','system-update'),path.join(APP_DIR,'.mercato','system-update')]
 let request,requestFile,ref='main',actor='automatic'
 if(manual){
  const candidates=dirs.map(d=>path.join(d,'request.json')).filter(f=>fs.existsSync(f)).map(f=>({f,r:JSON.parse(fs.readFileSync(f,'utf8'))})).sort((a,b)=>Date.parse(b.r.requestedAt)-Date.parse(a.r.requestedAt))
  if(!candidates.length)throw Error('No upgrade request')
  request=candidates[0].r;requestFile=candidates[0].f;ref=validateRequest(request);actor=request.actor||'administrator'
  if(fs.existsSync(path.join(STATE_DIR,'consumed-ui-request.json'))){const old=JSON.parse(fs.readFileSync(path.join(STATE_DIR,'consumed-ui-request.json'),'utf8'));if(old.requestedAt===request.requestedAt&&old.actor===actor)throw Error('Request already consumed; submit a new request')}
 }
 // Fetch does not checkout, reset, stash, merge, or overwrite the development tree.
 gitOut(['fetch','--no-tags','origin','+refs/heads/main:refs/remotes/origin/main'],{timeout:60000})
 const sha=gitOut(['rev-parse','--verify',`${ref==='main'||ref==='origin/main'||ref==='refs/heads/main'?'refs/remotes/origin/main':ref}^{commit}`])
 const ancestor=spawnSync('git',['merge-base','--is-ancestor',sha,'refs/remotes/origin/main'],{cwd:APP_DIR,timeout:10000})
 if(ancestor.status!==0)throw Error('Target is not an ancestor of remote main')
 const manifest=JSON.parse(fs.readFileSync(path.join(current,'release.json'),'utf8'))
 const forward=spawnSync('git',['merge-base','--is-ancestor',manifest.sha,sha],{cwd:APP_DIR,timeout:10000})
 if(forward.status!==0)throw Error('Automatic downgrade/divergence refused; use separately approved rollback')
 console.log(JSON.stringify({mode:manual?'manual':'auto',sha,current:manifest.sha,dryRun:dry}))
 if(dry)return
 if(manual)writeJsonAtomic(path.join(STATE_DIR,'consumed-ui-request.json'),{requestedAt:request.requestedAt,actor,sha})
 const stateDirs=manual?[path.dirname(requestFile)]:[]
 for(const d of stateDirs)writeJsonAtomic(path.join(d,'state.json'),{status:'running',step:'isolated-executor',toCommit:sha,actor,startedAt:new Date().toISOString()})
 // Existing executor owns flock, CI gating, candidate checks, switch and rollback.
 // The unified entry always requests the CI release package; a local build is an
 // explicit operator fallback (`deploy.mjs --build-locally`), never an implicit one.
 const child=spawnSync(process.execPath,[path.join(APP_DIR,'scripts/auto-deploy/deploy.mjs'),manual?'--manual':'--auto','--from-artifact','--sha',sha,'--allow-production'],{cwd:APP_DIR,env:{...process.env,ILA3_ALLOW_PRODUCTION:'1'},stdio:'inherit',timeout:5200000})
 const code=child.status??1
 for(const d of stateDirs)writeJsonAtomic(path.join(d,'state.json'),legacyState(code,sha,actor))
 process.exitCode=code
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('[unified-deploy]',e.message);process.exitCode=1})
