import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
export function classify({dirty,ahead,behind,migration,ci}) {
 if(dirty) return 'blocked-worktree'
 if(ahead) return 'blocked-local-ahead'
 if(!behind) return 'up-to-date'
 if(migration) return 'blocked-migration'
 if(!ci) return 'waiting-ci'
 return 'ready-for-isolated-deployment'
}
export async function main(){
 const root=process.env.ILA3_APP_DIR||'/home/pro/apps/mercato'
 const stateDir=path.join(root,'.mercato','auto-deploy');fs.mkdirSync(stateDir,{recursive:true})
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim()
 let state={checkedAt:new Date().toISOString(),branch:'main',status:'checking'}
 try{
  const dirty=!!git('status','--porcelain')
  state.localCommit=git('rev-parse','HEAD')
  // Never mutate the development branch or remove collaborator changes.
  if(dirty){state.status='blocked-worktree'}else{
   git('fetch','--no-tags','origin','main')
   state.targetCommit=git('rev-parse','refs/remotes/origin/main')
   const [ahead,behind]=git('rev-list','--left-right','--count','HEAD...origin/main').split(/\s+/).map(Number)
   state.ahead=ahead;state.behind=behind
   const changed=behind&&!ahead?git('diff','--name-only','HEAD','origin/main'):''
   const migration=changed.split('\n').some(p=>/(^|\/)(migrations?|schema)(\/|\.)|(^|\/)(package\.json|yarn\.lock|Dockerfile)$|(^|\/)vendor\//.test(p))
   let ci=false
   if(behind&&!ahead&&!migration){
    const token=fs.readFileSync('/home/pro/.config/ila3/github-token','utf8').trim()
    const res=await fetch(`https://api.github.com/repos/ctomall/ila3-commerce/actions/workflows/build-artifact.yml/runs?branch=main&event=push&per_page=30`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)})
    if(!res.ok)throw Error(`CI lookup HTTP ${res.status}`)
    const runs=(await res.json()).workflow_runs||[]
    ci=runs.some(r=>r.head_sha===state.targetCommit&&r.head_branch==='main'&&r.conclusion==='success')
   }
   state.status=classify({dirty,ahead,behind,migration,ci})
   // The legacy reset-hard updater is intentionally not called. It cannot safely
   // publish source + dependencies + output atomically while work continues.
   if(state.status==='ready-for-isolated-deployment')state.status='blocked-isolated-executor-required'
  }
 }catch(e){state.status='check-failed';state.message=e.message.replace(/https?:\/\/\S+/g,'[url]')}
 const out=path.join(stateDir,'status.json');fs.writeFileSync(out+'.tmp',JSON.stringify(state,null,2)+'\n');fs.renameSync(out+'.tmp',out)
 console.log(JSON.stringify(state));return state
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main()
