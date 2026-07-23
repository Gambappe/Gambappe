// NOT a Node script. This is a workflow definition for Claude's Workflow tool
// (Claude Code / Claude agent sessions). Run it with:
//   Workflow({ scriptPath: "scripts/xtrace-task-review.workflow.js",
//              args: { taskDocPath: "docs/xtrace-hackathon-tasks.md",
//                      logPath: "docs/xtrace-hackathon-review-log.md",
//                      maxRounds: 4 } })
//
// Purpose: adversarial review loop over the xTrace hackathon task breakdown.
// Every edit to the task doc must be followed by re-running this workflow
// until a full round produces zero accepted findings (see the review log's
// Process section). The loop:
//   Round N: 4 reviewer lenses read the doc from disk in parallel
//     -> findings merged (barrier: the fixer needs the full round's findings)
//     -> if zero findings: done
//     -> else a single fixer agent applies/rejects each finding in the doc,
//        appends a round entry to the review log, and the next round begins.

export const meta = {
  name: 'xtrace-task-review',
  description: 'Adversarial review loop for the xTrace hackathon task doc: 4 lenses find issues, a fixer applies them, repeat until a clean round',
  phases: [
    { title: 'Review', detail: '4 parallel lenses: repo-reality, junior-implementability, correctness/design, cross-task consistency' },
    { title: 'Fix', detail: 'one fixer agent applies accepted findings and logs the round' },
  ],
}

const REPO = '/home/user/Gambappe'
const taskDocPath = (args && args.taskDocPath) || 'docs/xtrace-hackathon-tasks.md'
const logPath = (args && args.logPath) || 'docs/xtrace-hackathon-review-log.md'
const maxRounds = (args && args.maxRounds) || 4

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'task_id', 'claim', 'problem', 'suggested_fix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          task_id: { type: 'string', description: 'e.g. XH-T3, or "doc" for doc-wide issues' },
          claim: { type: 'string', description: 'the exact statement/spec element in the doc that is wrong or ambiguous (quote it)' },
          problem: { type: 'string', description: 'why it is wrong, ambiguous, or would mislead a junior engineer — with evidence (file:line for repo-reality findings)' },
          suggested_fix: { type: 'string', description: 'the concrete replacement text or addition' },
        },
      },
    },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  required: ['applied', 'rejected', 'summary'],
  properties: {
    applied: { type: 'integer' },
    rejected: { type: 'integer' },
    summary: { type: 'string', description: 'one line per finding: APPLIED or REJECTED(reason)' },
  },
}

const LENSES = [
  {
    key: 'repo-reality',
    prompt: `Lens: REPO REALITY. Verify every concrete reference in the task doc against the actual repo at ${REPO}: file paths, package names, table/column names, job names, flag names, env var names, API routes, schema/type names, section references (§N), workstream IDs. Use Read/Grep — do not trust the doc. Anything that does not exist must either be explicitly marked as NEW (to be created by that task) or is a finding. Also verify claimed repo conventions (test locations, migration commands, contract-change rules) match what the repo actually does.`,
  },
  {
    key: 'junior-implementability',
    prompt: `Lens: JUNIOR IMPLEMENTABILITY. Read each task as a junior engineer with no context beyond this doc and the repo. A finding is any point where they would have to guess or ask: missing function signatures, unspecified error behavior, ambiguous acceptance criteria (not mechanically checkable), undefined terms, steps that assume unstated knowledge, missing file paths for new code, unspecified data shapes, "handle errors appropriately"-style hand-waving. Acceptance criteria must be concrete enough that the junior knows exactly when they are done.`,
  },
  {
    key: 'correctness-design',
    prompt: `Lens: CORRECTNESS & DESIGN. Hunt for real defects in the specified design: race conditions, idempotency gaps (jobs are at-least-once pg-boss), missing DB constraints/indexes for the specified queries, cache-invalidation errors, N+1 or hot-path latency problems, LLM/xTrace calls that could block SSR or a job queue, missing timeouts/retries/fail-open behavior, secrets or PII in prompts/payloads, violations of the doc's own stated invariants (engine purity INV-5, §9.3 no pre-lock pick leakage, money-word filtering INV-8), migration mistakes, and test plans that would not catch the bugs the design could have. Also flag over-engineering: anything beyond what the tasks' stated hackathon scope needs.`,
  },
  {
    key: 'cross-task-consistency',
    prompt: `Lens: CROSS-TASK CONSISTENCY. Check the doc as a whole: dependency order is correct and acyclic; names (packages, tables, functions, env vars, flags, job names) are used identically across tasks; no two tasks own the same file or responsibility; no task consumes something no other task produces; shared constants/types are defined in exactly one place; the pinned xTrace API appendix matches how every task uses the API; scope boundaries between tasks leave no gaps and no overlaps; effort ordering makes sense for a hackathon (demo-critical path first).`,
  },
]

let round = 0
let totalApplied = 0

while (round < maxRounds) {
  round += 1
  log(`Round ${round}: reviewing ${taskDocPath}`)

  // Barrier justified: the fixer must see ALL of the round's findings together
  // to dedupe overlapping ones and apply consistent edits.
  const results = await parallel(LENSES.map((l) => () => agent(
    `You are an adversarial reviewer of an engineering task breakdown. Round ${round}.

Read ${REPO}/${taskDocPath} in full first. The doc's own "Ground rules" and "xTrace API reference" sections are part of the spec — tasks must be consistent with them.

${l.prompt}

Report ONLY real findings — issues that would cause a wrong implementation, a blocked junior engineer, or a defect. Do not report stylistic preferences, restatements of intentional scope cuts the doc already declares, or hypothetical concerns the doc already addresses. If the doc is clean under your lens, return an empty findings list — do not invent findings to seem useful. Severity: blocker = would produce wrong/broken code or an unimplementable task; major = a junior would stall or likely diverge; minor = small ambiguity with a likely-correct guess.

Your final output is raw data for a fixer step, not prose for a human.`,
    { label: `r${round}:${l.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }
  )))

  const findings = results.filter(Boolean).flatMap((r) => r.findings)
  log(`Round ${round}: ${findings.length} findings`)

  if (findings.length === 0) {
    log(`Round ${round} clean — review converged`)
    return { converged: true, rounds: round, totalApplied }
  }

  const fix = await agent(
    `You are the fixer for round ${round} of an adversarial review of ${REPO}/${taskDocPath}.

FINDINGS (from 4 independent reviewers; may overlap or conflict):
${JSON.stringify(findings, null, 1)}

Steps:
1. Read the task doc in full.
2. Dedupe overlapping findings. For each unique finding, decide: APPLY (edit the doc with the fix — verify repo facts yourself with Read/Grep before writing them into the doc) or REJECT (the finding is wrong, already addressed, or out of the doc's declared scope — you must be able to say why).
3. Apply all accepted fixes to ${REPO}/${taskDocPath} with the Edit tool. Keep the doc's structure and voice; fixes must be surgical, not rewrites. If two findings conflict, resolve in favor of repo reality, then correctness, then junior clarity.
4. Append a round entry to ${REPO}/${logPath} under "## Round history" in this exact format:
   ### Round ${round} — <applied> applied, <rejected> rejected
   - APPLIED [severity] task_id: one-line description of the change
   - REJECTED [severity] task_id: claim — reason
5. Update the "Status" line near the top of ${logPath} to: "Status: round ${round} complete, <applied> fixes applied, awaiting next review round."

Your final output is raw data, not prose.`,
    { label: `r${round}:fixer`, phase: 'Fix', schema: FIX_SCHEMA }
  )

  if (fix) {
    totalApplied += fix.applied
    log(`Round ${round}: ${fix.applied} applied, ${fix.rejected} rejected`)
    if (fix.applied === 0) {
      log(`Round ${round}: all findings rejected — treating as converged`)
      return { converged: true, rounds: round, totalApplied, note: 'final round findings all rejected as invalid' }
    }
  }
}

return { converged: false, rounds: round, totalApplied, note: `hit maxRounds=${maxRounds} without a clean round — re-run to continue` }
