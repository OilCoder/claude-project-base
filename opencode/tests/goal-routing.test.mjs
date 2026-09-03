import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { routeGoal } from "../.opencode/codegen/lib/goal-routing.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))

async function fixtureGoal() {
  return JSON.parse(await readFile(path.join(here, "fixtures/goal-research/goal.json"), "utf8"))
}

const decision = {
  id: "DEC-1",
  question: "Application check or database constraint?",
  decision: "Database constraint",
  rationale: "Avoids the race condition",
  research_report_ids: ["RR-1"],
}

function sealedDirect(goal) {
  return {
    ...goal,
    status: "SEALED",
    research_questions: [],
    decisions: [],
    routing: { ...goal.routing, external_research_required: false },
  }
}

test("invalid goal is reported, not routed", async () => {
  const goal = await fixtureGoal()
  const result = routeGoal({ ...goal, title: "" })
  assert.equal(result.status, "INVALID_GOAL")
  assert.equal(result.route, null)
})

test("open goal with pending required research routes deliberative with research budget", async () => {
  const goal = await fixtureGoal()
  const result = routeGoal(goal)
  assert.equal(result.status, "ROUTED")
  assert.equal(result.route, "deliberative")
  assert.deepEqual(result.reasons, ["external-research-required", "required-research-pending"])
  assert.ok(result.allowed_events.includes("RESEARCH_REQUESTED"))
  assert.equal(result.budgets.research_calls, 2)
  assert.equal(result.budgets.planner_calls, 0)
})

test("architecture uncertainty and blocking questions are deliberative signals", async () => {
  const goal = await fixtureGoal()
  const result = routeGoal({
    ...goal,
    research_questions: [],
    open_questions: [{ id: "OQ-1", question: "Which error code?", blocking: true }],
    routing: { ...goal.routing, external_research_required: false, architecture_uncertainty: true },
  })
  assert.equal(result.route, "deliberative")
  assert.deepEqual(result.reasons, ["architecture-uncertainty", "blocking-questions-open"])
})

test("pending required research without research budget is BUDGET_BLOCKED", async () => {
  const goal = await fixtureGoal()
  const result = routeGoal({ ...goal, budgets: { ...goal.budgets, max_research_calls: 0 } })
  assert.equal(result.status, "BUDGET_BLOCKED")
  assert.ok(result.reasons.includes("no-research-budget"))
})

test("open goal without deliberative signals waits for user approval", async () => {
  const goal = await fixtureGoal()
  const result = routeGoal({ ...sealedDirect(goal), status: "DECIDED" })
  assert.equal(result.status, "GOAL_NOT_SEALED")
  assert.deepEqual(result.reasons, ["goal-requires-user-approval"])
})

test("sealed localized low-risk goal with an existing gate routes direct", async () => {
  const goal = await fixtureGoal()
  const result = routeGoal(sealedDirect(goal))
  assert.equal(result.route, "direct")
  assert.deepEqual(result.reasons, ["localized", "low-risk", "existing-gate"])
  assert.equal(result.budgets.contracts, 1)
  assert.equal(result.budgets.planner_calls, 1)
})

test("sealed goal that needs a gate or spans components routes planned", async () => {
  const goal = await fixtureGoal()
  const noGate = routeGoal({
    ...sealedDirect(goal),
    routing: { ...sealedDirect(goal).routing, existing_gate: false },
  })
  assert.equal(noGate.route, "planned")
  assert.ok(noGate.reasons.includes("gate-preparation-may-be-required"))

  const multi = routeGoal({
    ...sealedDirect(goal),
    routing: { ...sealedDirect(goal).routing, change_shape: "multi-component", risk: "medium" },
  })
  assert.equal(multi.route, "planned")
  assert.deepEqual(multi.reasons, ["shape:multi-component", "risk:medium"])
  assert.equal(multi.budgets.planner_calls, 1)
  assert.ok(multi.allowed_events.includes("PLAN_REQUESTED"))
})

test("sealed goal with recorded deliberation never routes direct or deliberative", async () => {
  const goal = await fixtureGoal()
  const result = routeGoal({
    ...goal,
    status: "SEALED",
    decisions: [decision],
    research_questions: goal.research_questions.map((item) => ({ ...item, status: "completed" })),
  })
  assert.equal(result.status, "ROUTED")
  assert.equal(result.route, "planned")
  assert.ok(result.reasons.includes("deliberation-recorded"))
})

test("a Goal without planner budget never reaches routing: the validator rejects it", async () => {
  const goal = await fixtureGoal()
  const result = routeGoal({
    ...sealedDirect(goal),
    routing: { ...sealedDirect(goal).routing, change_shape: "system", risk: "high" },
    budgets: { ...goal.budgets, max_planner_calls: 0 },
  })
  assert.equal(result.status, "INVALID_GOAL")
  assert.ok(result.reasons.some((reason) => reason.includes("max_planner_calls must be at least 1")))
})
