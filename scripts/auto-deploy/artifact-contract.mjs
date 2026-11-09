/** Fail-closed validation before a CI runtime package may be staged. */
export function validateArtifact(m, expected){
 const errors=[]
 if(m?.schema!==1)errors.push('unsupported-schema')
 if(!/^[a-f0-9]{40}$/.test(m?.commit||'')||m.commit!==expected.commit)errors.push('commit-mismatch')
 if(!/^[a-f0-9]{64}$/.test(m?.sha256||'')||m.sha256!==expected.sha256)errors.push('digest-mismatch')
 if(m?.repository!==expected.repository)errors.push('repository-mismatch')
 if(m?.workflowRunId!==expected.workflowRunId)errors.push('workflow-run-mismatch')
 if(m?.runtime?.nodeMajor!==expected.nodeMajor||m?.runtime?.platform!==expected.platform||m?.runtime?.arch!==expected.arch)errors.push('runtime-mismatch')
 if(!Array.isArray(m?.checks)||!['typecheck','unit','build'].every(c=>m.checks.includes(c)))errors.push('checks-incomplete')
 if(m?.database?.migrationRequired!==false)errors.push('migration-approval-required')
 return {ok:errors.length===0,errors}
}
// expected values must come from authenticated CI metadata and locally computed
// archive digest, never solely from the archive's own manifest.
