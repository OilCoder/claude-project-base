import assert from "node:assert/strict"
import test from "node:test"

import { routeDerivedWork } from "../.opencode/codegen/lib/derived-work.mjs"

const goal = { budgets: { max_derived_tasks: 1 } }
const finding = {
  parent_contract_id: "c1",
  evidence: ["gate output: missing null check"],
  required_for_goal: true,
  within_goal_scope: true,
  localized: true,
  low_risk: true,
  existing_gate: true,
  allowed_to_modify: ["src/service.ts"],
}

test("small in-scope finding with budget becomes a direct repair", () => {
  const result = routeDerivedWork(finding, { goal })
  assert.equal(result.disposition, "DIRECT_REPAIR")
  assert.equal(result.budget_remaining, 0)
})

test("budget exhaustion, scope, and shape send the finding back to planning", () => {
  assert.equal(routeDerivedWork(finding, { goal, derivedTasksUsed: 1 }).disposition, "REPLAN_REQUIRED")
  const notLocal = routeDerivedWork({ ...finding, localized: false, low_risk: false }, { goal })
  assert.equal(notLocal.disposition, "REPLAN_REQUIRED")
  assert.deepEqual(notLocal.reasons, ["not-localized", "not-low-risk"])
  const api = routeDerivedWork({ ...finding, changes_api: true }, { goal })
  assert.deepEqual(api, { disposition: "REPLAN_REQUIRED", reasons: ["changes-api"] })
})

test("product decisions, optional findings, and unsupported findings are not executed", () => {
  assert.equal(routeDerivedWork({ ...finding, needs_product_decision: true }, { goal }).disposition, "USER_DECISION_REQUIRED")
  assert.equal(routeDerivedWork({ ...finding, required_for_goal: false }, { goal }).disposition, "RECORDED")
  const rejected = routeDerivedWork({ ...finding, parent_contract_id: "", evidence: [] }, { goal })
  assert.deepEqual(rejected, { disposition: "REJECTED", reasons: ["missing-parent-contract", "missing-evidence"] })
})
