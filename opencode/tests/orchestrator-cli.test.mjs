import assert from "node:assert/strict"
import { execFile as execFileCallback } from "node:child_process"
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const execFile = promisify(execFileCallback)
const here = path.dirname(fileURLToPath(import.meta.url))
const systemRoot = path.resolve(here, "..")
const fixture = path.join(here, "fixtures/orchestrator-basic")

// Fake `opencode`: the planner writes the fixture plan with the real HEAD, the
// builder applies a canned solution for the contract found in its cwd and logs
// start/end times so parallelism is observable. FAKE_FAIL_FIRST names a
// contract whose first attempt writes a wrong implementation.
const fakeOpenCode = `#!/usr/bin/env node
const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const argv = process.argv
const agent = argv[argv.indexOf("--agent") + 1]
const prompt = argv[argv.length - 1]
const sleepMs = Number(process.env.FAKE_SLEEP_MS || 600)
function log(record) { fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(record) + "\\n") }
function done() { console.log(JSON.stringify({type:"step_finish",part:{cost:0.001,tokens:{input:5,output:5,reasoning:0,cache:{read:0,write:0}}}})) }
if (agent === "planner") {
  const output = prompt.match(/Write the complete plan to (\\S+)\\./)[1]
  const plan = JSON.parse(fs.readFileSync(process.env.FAKE_PLAN_TEMPLATE, "utf8"))
  plan.base_revision = execFileSync("git", ["rev-parse", "HEAD"]).toString().trim()
  // FAKE_PLAN_INVALID_FIRST: the first plan uses a wildcard the validator
  // rejects; the retry (prompt carries the evidence) is clean.
  const retry = /This is a retry/.test(prompt)
  if (process.env.FAKE_PLAN_INVALID_FIRST && !retry) plan.phases[0].contracts[0].allowed_to_modify = ["lib/*.py"]
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(plan, null, 2))
  log({ agent, prompt, retry })
  done()
} else if (agent === "builder") {
  const contract = JSON.parse(fs.readFileSync(".codegen-contract/contract.json", "utf8"))
  const retry = /This is a retry/.test(prompt)
  const evidence = (prompt.match(/attempt at (\\S+) before/) || [])[1] || null
  const evidenceExists = evidence ? fs.existsSync(evidence) : null
  const start = Date.now()
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepMs)
  const wrong = process.env.FAKE_FAIL_FIRST === contract.contract_id && !retry
  const solution = path.join(process.env.FAKE_SOLUTIONS, contract.contract_id + (wrong ? "-wrong" : "") + ".py")
  fs.copyFileSync(solution, contract.allowed_to_modify[0])
  log({ agent, contract_id: contract.contract_id, cwd: process.cwd(), start, end: Date.now(), retry, evidence, evidence_exists: evidenceExists, gate: contract.verification.commands })
  done()
} else {
  log({ agent, prompt })
  done()
}
`

async function project(goalFixture = path.join(fixture, ".codegen-goal/goal.json")) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "orchestrator-test-"))
  const bin = path.join(directory, "bin-fake")
  await mkdir(bin)
  await writeFile(path.join(bin, "opencode"), fakeOpenCode, { mode: 0o755 })
  for (const entry of ["lib", "tests"]) await cp(path.join(fixture, entry), path.join(directory, entry), { recursive: true })
  await mkdir(path.join(directory, ".codegen-goal"))
  await cp(goalFixture, path.join(directory, ".codegen-goal/goal.json"))
  await writeFile(path.join(directory, ".gitignore"), "bin-fake/\nfake.log\n__pycache__/\n.codegen-goal/\n.codegen-plan/\n")
  const git = (...args) => execFile("git", args, { cwd: directory })
  await git("init", "-q", "-b", "main")
  await git("-c", "user.name=t", "-c", "user.email=t@localhost", "add", ".")
  await git("-c", "user.name=t", "-c", "user.email=t@localhost", "commit", "-q", "-m", "baseline")
  return { directory, bin, git }
}

function orchestrate(tree, args, env = {}) {
  return execFile(process.execPath, [path.join(systemRoot, ".opencode/codegen/scripts/orchestrate.mjs"), "--minimum-status", "candidate", ...args], {
    cwd: tree.directory,
    env: {
      ...process.env,
      PATH: `${tree.bin}${path.delimiter}${process.env.PATH}`,
      FAKE_LOG: path.join(tree.directory, "fake.log"),
      FAKE_PLAN_TEMPLATE: path.join(fixture, "plan-template.json"),
      FAKE_SOLUTIONS: path.join(fixture, "solutions"),
      PYTHONDONTWRITEBYTECODE: "1",
      ...env,
    },
    maxBuffer: 16 * 1024 * 1024,
  }).then(
    (result) => ({ code: 0, ...result }),
    (error) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }),
  )
}

async function readLog(tree) {
  return (await readFile(path.join(tree.directory, "fake.log"), "utf8")).trim().split("\n").map(JSON.parse)
}

async function events(tree, runId) {
  return (await readFile(path.join(tree.directory, ".codegen-run", runId, "events.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line).event)
}

test("planned route: parallel wave, dependent wave, integration branch, final gate", async () => {
  const tree = await project()
  try {
    const result = await orchestrate(tree, ["--run-id", "r1", "--concurrency", "2"])
    assert.equal(result.code, 0, result.stderr)
    const state = JSON.parse(result.stdout)
    assert.equal(state.status, "COMPLETED")
    assert.equal(state.route, "planned")
    assert.equal(state.planner_calls, 1)
    assert.deepEqual(state.waves.map((wave) => wave.phases), [["core"], ["compose"]])
    assert.deepEqual(state.waves.map((wave) => wave.status), ["COMPLETED", "COMPLETED"])
    assert.ok(state.waves.flatMap((wave) => wave.contracts).every((c) => c.status === "PASSED" && c.result_commit))
    assert.equal(state.final_gate.result, "PASS")
    assert.deepEqual(state.final_gate.changed_files, ["lib/alpha.py", "lib/beta.py", "lib/gamma.py"])
    assert.deepEqual(state.final_gate.checks.map((check) => [check.contract_id, check.exit_code]), [
      ["alpha", 0], ["beta", 0], ["gamma", 0], [null, 0],
    ])

    // Wave 1 builders overlapped in time; gamma started only after both ended.
    const log = (await readLog(tree)).filter((entry) => entry.agent === "builder")
    const byId = Object.fromEntries(log.map((entry) => [entry.contract_id, entry]))
    assert.ok(byId.alpha.start < byId.beta.end && byId.beta.start < byId.alpha.end, "wave-1 builders did not overlap")
    assert.ok(byId.gamma.start >= Math.max(byId.alpha.end, byId.beta.end))
    assert.ok(byId.alpha.cwd.endsWith("/.codegen-run/r1/worktrees/alpha"))
    assert.deepEqual(byId.alpha.gate, ["bash .codegen-contract/gate.sh"])

    // The integration branch carries the three results and nothing else.
    const { stdout: files } = await tree.git("ls-tree", "-r", "--name-only", "codegen/r1")
    assert.ok(!files.includes(".codegen-contract"))
    const { stdout: gamma } = await tree.git("show", "codegen/r1:lib/gamma.py")
    assert.ok(gamma.includes("return beta(alpha(value))"))
    const { stdout: count } = await tree.git("rev-list", "--count", "main..codegen/r1")
    assert.equal(count.trim(), "3")

    // The user's checkout is untouched.
    const { stdout: status } = await tree.git("status", "--porcelain")
    assert.equal(status.trim(), "")
    assert.ok((await readFile(path.join(tree.directory, "lib/alpha.py"), "utf8")).includes("NotImplementedError"))
    await assert.rejects(access(path.join(tree.directory, ".codegen-run/r1/worktrees/alpha")))

    const sequence = await events(tree, "r1")
    for (const event of ["GOAL_LOADED", "ROUTED", "PLAN_REQUESTED", "PLAN_VALIDATED", "DAG_READY", "WAVE_READY", "GATE_READY", "BUILDER_DISPATCHED", "CONTRACT_PASSED", "INTEGRATED", "WAVE_COMPLETED", "FINAL_GATE_PASS", "RUN_COMPLETED"]) {
      assert.ok(sequence.includes(event), `missing event ${event}`)
    }
    assert.ok(!sequence.includes("GATE_DESIGN_REQUESTED"))
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})

test("serial concurrency and retry with evidence after a failed gate", async () => {
  const tree = await project()
  try {
    const result = await orchestrate(tree, ["--run-id", "r2", "--concurrency", "1", "--keep-worktrees", "true"], { FAKE_FAIL_FIRST: "beta" })
    assert.equal(result.code, 0, result.stderr)
    const state = JSON.parse(result.stdout)
    assert.equal(state.status, "COMPLETED")
    const beta = state.waves[0].contracts.find((c) => c.contract_id === "beta")
    assert.deepEqual(beta.attempts.map((attempt) => attempt.result), ["GATE_FAIL", "PASS"])
    assert.equal(beta.attempts[1].evidence, ".codegen-contract/evidence-1.json")

    const log = (await readLog(tree)).filter((entry) => entry.agent === "builder")
    const betaRuns = log.filter((entry) => entry.contract_id === "beta")
    assert.deepEqual(betaRuns.map((entry) => [entry.retry, entry.evidence_exists]), [[false, null], [true, true]])
    const alpha = log.find((entry) => entry.contract_id === "alpha")
    assert.ok(alpha.end <= betaRuns[0].start || betaRuns[1].end <= alpha.start, "builders overlapped with concurrency 1")

    const evidence = JSON.parse(await readFile(path.join(tree.directory, ".codegen-run/r2/worktrees/beta/.codegen-contract/evidence-1.json"), "utf8"))
    assert.equal(evidence.result, "GATE_FAIL")
    assert.match(evidence.verification[0].output, /AssertionError/)
    const sequence = await events(tree, "r2")
    assert.ok(sequence.includes("RETRY"))
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})

test("direct route: the Planner is capped at one contract and the run has one wave", async () => {
  const tree = await project(path.join(fixture, "goal-direct.json"))
  try {
    const result = await orchestrate(tree, ["--run-id", "r4"], { FAKE_PLAN_TEMPLATE: path.join(fixture, "plan-direct.json") })
    assert.equal(result.code, 0, result.stderr)
    const state = JSON.parse(result.stdout)
    assert.equal(state.status, "COMPLETED")
    assert.equal(state.route, "direct")
    assert.equal(state.planner_calls, 1)
    assert.equal(state.waves.length, 1)
    assert.deepEqual(state.final_gate.changed_files, ["lib/alpha.py"])
    const planner = (await readLog(tree)).find((entry) => entry.agent === "planner")
    assert.match(planner.prompt, /exactly one phase containing exactly one contract/)
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})

test("direct route rejects a plan with more than one contract", async () => {
  const tree = await project(path.join(fixture, "goal-direct.json"))
  try {
    const result = await orchestrate(tree, ["--run-id", "r5"])
    assert.equal(result.code, 1)
    const state = JSON.parse(result.stdout)
    assert.equal(state.status, "PLAN_FAILED")
    assert.equal(state.waves.length, 0)
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})

test("a deliberated goal the user has not approved stops for approval", async () => {
  const tree = await project(path.join(fixture, "goal-direct.json"))
  try {
    const goalPath = path.join(tree.directory, ".codegen-goal/goal.json")
    const goal = JSON.parse(await readFile(goalPath, "utf8"))
    await writeFile(goalPath, JSON.stringify({ ...goal, status: "DECIDED" }))
    const result = await orchestrate(tree, ["--run-id", "r6"])
    assert.equal(result.code, 1)
    const state = JSON.parse(result.stdout)
    assert.equal(state.status, "APPROVAL_REQUIRED")
    assert.equal(state.planner_calls, 0)
    await assert.rejects(readFile(path.join(tree.directory, "fake.log")))
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})

test("a goal that still needs deliberation stops before planning", async () => {
  const tree = await project(path.join(here, "fixtures/goal-research/goal.json"))
  try {
    const result = await orchestrate(tree, ["--run-id", "r3"])
    assert.equal(result.code, 1)
    const state = JSON.parse(result.stdout)
    assert.equal(state.status, "DELIBERATION_REQUIRED")
    assert.equal(state.planner_calls, 0)
    await assert.rejects(readFile(path.join(tree.directory, "fake.log")))
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})

test("a plan the validator rejects is re-requested with evidence within the planner budget", async () => {
  const tree = await project()
  try {
    const goalPath = path.join(tree.directory, ".codegen-goal/goal.json")
    const goal = JSON.parse(await readFile(goalPath, "utf8"))
    await writeFile(goalPath, JSON.stringify({ ...goal, budgets: { ...goal.budgets, max_planner_calls: 2 } }))
    const result = await orchestrate(tree, ["--run-id", "r7"], { FAKE_PLAN_INVALID_FIRST: "1" })
    assert.equal(result.code, 0, result.stderr)
    const state = JSON.parse(result.stdout)
    assert.equal(state.status, "COMPLETED")
    assert.equal(state.planner_calls, 2)
    assert.equal(state.plan_path, ".codegen-plan/r7-2.json")
    const names = await events(tree, "r7")
    assert.ok(names.includes("PLAN_RETRY"))
    const evidence = JSON.parse(await readFile(path.join(tree.directory, ".codegen-plan/r7-1.evidence.json"), "utf8"))
    assert.ok(evidence.errors.some((e) => e.includes("allowed_to_modify: lib/*.py")))
    const planners = (await readLog(tree)).filter((entry) => entry.agent === "planner")
    assert.deepEqual(planners.map((entry) => entry.retry), [false, true])
    assert.ok(planners[1].prompt.includes("rejected by the deterministic validator"))

    // With budget 1 the same failure stops the run.
    await writeFile(goalPath, JSON.stringify({ ...goal, budgets: { ...goal.budgets, max_planner_calls: 1 } }))
    const stopped = await orchestrate(tree, ["--run-id", "r8"], { FAKE_PLAN_INVALID_FIRST: "1" })
    assert.equal(stopped.code, 1)
    assert.equal(JSON.parse(stopped.stdout).status, "PLAN_FAILED")
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})

test("a project that ignores .codegen-contract still gets sealed contracts committed in the worktree", async () => {
  const tree = await project()
  try {
    await writeFile(path.join(tree.directory, ".gitignore"), "bin-fake/\nfake.log\n__pycache__/\n.codegen-goal/\n.codegen-plan/\n.codegen-contract/\n.codegen-run/\n")
    await tree.git("-c", "user.name=t", "-c", "user.email=t@localhost", "commit", "-qam", "ignore contract dir")
    const result = await orchestrate(tree, ["--run-id", "r9", "--concurrency", "2"])
    assert.equal(result.code, 0, result.stderr)
    const state = JSON.parse(result.stdout)
    assert.equal(state.status, "COMPLETED")
    assert.ok(state.waves.flatMap((wave) => wave.contracts).every((c) => c.status === "PASSED"))
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})
