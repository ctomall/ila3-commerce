/**
 * CI eligibility gate for the isolated auto-deploy executor.
 *
 * A release is eligible only when BOTH are true:
 *   1. the target SHA has a completed, successful GitHub Actions run, and
 *   2. that run's workflow file actually contains a test command
 *      (checked by reading the workflow from the git object, not by trusting
 *      the run conclusion alone).
 *
 * Exit codes: 0 allow, 2 deny, 3 gate error (also deny).
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  APP_DIR,
  CHECKER_STATE_DIR,
  GATES_DIR,
  ensureDirs,
  git,
  gitOut,
  nowIso,
  parseRemoteSlug,
  readJson,
  sha256Text,
  tailLines,
  writeJsonAtomic,
} from './lib.mjs'

const TOKEN_FILE = process.env.GITHUB_TOKEN_FILE || '/home/pro/.config/ila3/github-token'

// Commands that prove a workflow runs tests. Deliberately excludes build/lint.
const TEST_COMMAND_RE =
  /(?:^|[\s;&|])(?:(?:yarn|npm|pnpm|bun)(?:\s+run)?\s+(?:test(?::[\w.-]+)?|jest|vitest|playwright)|npx\s+(?:jest|vitest|playwright)|jest|vitest|playwright\s+test|cypress\s+run)(?=$|[\s;&|])/m
const TEST_ACTION_RE = /uses:\s*[^\s#]*(?:playwright|cypress|jest|vitest)[^\s#]*@/i

/** Return every `run:` block from a GitHub Actions workflow, with line numbers. */
export function extractRunBlocks(workflowText) {
  const lines = String(workflowText).split(/\r?\n/)
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*)run:\s*(.*)$/)
    if (!match) continue
    const indent = match[1].length
    let body = match[2] || ''
    const first = body.trim()
    if (/^[|>][+-]?$/.test(first)) {
      const collected = []
      for (let j = i + 1; j < lines.length; j += 1) {
        const line = lines[j]
        if (line.trim() === '') {
          collected.push('')
          continue
        }
        const lineIndent = line.match(/^(\s*)/)[1].length
        if (lineIndent <= indent) break
        collected.push(line.slice(Math.min(line.length, indent + 2)))
      }
      body = collected.join('\n')
    }
    const withoutComments = body
      .split(/\r?\n/)
      .filter((line) => !/^\s*#/.test(line))
      .join('\n')
    blocks.push({line: i + 1, command: withoutComments.trim()})
  }
  return blocks
}

export function extractTestEvidence(workflowText) {
  const blocks = extractRunBlocks(workflowText)
  const steps = []
  for (const block of blocks) {
    if (TEST_COMMAND_RE.test(block.command)) {
      steps.push({line: block.line, command: block.command.split(/\r?\n/).find((line) => TEST_COMMAND_RE.test(line)) || block.command})
    }
  }
  const actionMatches = [...String(workflowText).matchAll(new RegExp(TEST_ACTION_RE.source, 'gim'))]
  for (const match of actionMatches) {
    steps.push({line: null, command: match[0].trim(), source: 'uses'})
  }
  return {
    hasTest: steps.length > 0,
    steps,
    runBlocks: blocks.length,
    digest: sha256Text(String(workflowText)),
  }
}

export function listWorkflowFiles(sha) {
  const result = git(['ls-tree', '-r', '--name-only', sha, '--', '.github/workflows'])
  if (result.status !== 0) throw new Error(`cannot list workflows at ${sha}: ${(result.stderr || '').trim()}`)
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\.ya?ml$/.test(line))
}

export function readWorkflowAt(sha, file) {
  return gitOut(['show', `${sha}:${file}`])
}

function readToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim()
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim()
  } catch {
    return ''
  }
}

export function evaluateWorkflows(sha) {
  const files = listWorkflowFiles(sha)
  const workflows = files.map((file) => {
    const text = readWorkflowAt(sha, file)
    const evidence = extractTestEvidence(text)
    return {path: file, hasTest: evidence.hasTest, testSteps: evidence.steps, digest: evidence.digest, runBlocks: evidence.runBlocks}
  })
  return {files, workflows, testWorkflows: workflows.filter((workflow) => workflow.hasTest)}
}

export async function runGate({sha, repoSlug = null, token = null, timeoutMs = 20000} = {}) {
  ensureDirs()
  const gate = {
    schema: 1,
    sha,
    checkedAt: nowIso(),
    decision: 'deny',
    allow: false,
    reason: null,
    workflows: [],
    runs: [],
    note: null,
  }

  try {
    const evaluated = evaluateWorkflows(sha)
    gate.workflows = evaluated.workflows
    gate.workflowFiles = evaluated.files
    if (evaluated.testWorkflows.length === 0) {
      gate.reason = 'no-test-step-in-ci-workflow'
      gate.note =
        'At least one workflow exists but none contains a test command (yarn/npm/pnpm test, jest, vitest, playwright, cypress). A green build-only run does not satisfy the release gate.'
      gate.decision = 'deny'
      persistGate(gate)
      return gate
    }

    const slug = repoSlug || parseRemoteSlug()
    gate.repo = slug
    const authToken = token ?? readToken()
    if (!authToken) {
      gate.reason = 'ci-token-missing'
      gate.note = `No GitHub token in GITHUB_TOKEN or ${TOKEN_FILE}; cannot verify CI.`
      persistGate(gate)
      return gate
    }

    const url = `https://api.github.com/repos/${slug}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=100`
    let response
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/vnd.github+json',
          'user-agent': 'ila3-auto-deploy/1.0',
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      gate.reason = 'ci-unreachable'
      gate.note = `GitHub Actions API request failed: ${String(error?.message || error)}`
      persistGate(gate)
      return gate
    }
    if (!response.ok) {
      gate.reason = 'ci-unreachable'
      gate.note = `GitHub Actions API returned HTTP ${response.status}`
      persistGate(gate)
      return gate
    }

    const body = await response.json()
    gate.runs = (body.workflow_runs || []).map((run) => ({
      id: run.id,
      path: run.path,
      status: run.status,
      conclusion: run.conclusion,
      headSha: run.head_sha,
      headBranch: run.head_branch,
      event: run.event,
      createdAt: run.created_at,
      url: run.html_url,
    }))

    const testPaths = new Set(evaluated.testWorkflows.map((workflow) => workflow.path))
    const successfulTestRun = gate.runs.find(
      (run) =>
        run.headSha === sha &&
        run.status === 'completed' &&
        run.conclusion === 'success' &&
        testPaths.has(run.path),
    )

    if (successfulTestRun) {
      gate.decision = 'allow'
      gate.allow = true
      gate.reason = 'successful-test-workflow-for-sha'
      gate.matchedRun = successfulTestRun
    } else {
      gate.reason = 'no-successful-test-run-for-sha'
      gate.note =
        'The SHA has no completed successful run of a workflow that contains a test command. Push the commit and let the test workflow finish before deploying.'
    }
  } catch (error) {
    gate.reason = 'gate-error'
    gate.note = String(error?.message || error)
  }

  persistGate(gate)
  return gate
}

function persistGate(gate) {
  gate.updatedAt = nowIso()
  writeJsonAtomic(path.join(GATES_DIR, `${gate.sha}.json`), gate)
  writeJsonAtomic(path.join(GATES_DIR, 'latest.json'), gate)
  writeJsonAtomic(path.join(CHECKER_STATE_DIR, 'ci-gate.json'), gate)
}

function printHuman(gate) {
  console.log(`[ci-gate] sha=${gate.sha}`)
  console.log(`[ci-gate] decision=${gate.decision} reason=${gate.reason}`)
  for (const workflow of gate.workflows || []) {
    console.log(`[ci-gate] workflow ${workflow.path} hasTest=${workflow.hasTest} runBlocks=${workflow.runBlocks}`)
    for (const step of workflow.testSteps || []) {
      console.log(`[ci-gate]   test@${step.line ?? 'uses'}: ${String(step.command).slice(0, 160)}`)
    }
  }
  if (gate.runs?.length) {
    console.log(`[ci-gate] runs for sha: ${gate.runs.length}`)
    for (const run of gate.runs.slice(0, 10)) {
      console.log(`[ci-gate]   ${run.path} status=${run.status} conclusion=${run.conclusion}`)
    }
  }
  if (gate.note) console.log(`[ci-gate] note=${gate.note}`)
  console.log(`[ci-gate] evidence=${path.join(GATES_DIR, `${gate.sha}.json`)}`)
}

async function main() {
  const argv = process.argv.slice(2)
  let sha = null
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--sha') sha = argv[++i]
    else if (argv[i] === '--json') json = true
  }
  const resolved = sha || gitOut(['rev-parse', 'HEAD'])
  const gate = await runGate({sha: resolved})
  if (json) console.log(JSON.stringify(gate, null, 2))
  else printHuman(gate)
  process.exit(gate.allow ? 0 : gate.reason === 'gate-error' ? 3 : 2)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[ci-gate] fatal: ${error?.stack || error}`)
    process.exit(3)
  })
}
