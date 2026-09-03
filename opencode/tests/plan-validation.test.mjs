import assert from "node:assert/strict"
import test from "node:test"

import {
  pathPatternsOverlap,
  validatePlan,
} from "../.opencode/codegen/lib/plan-validation.mjs"

function contract(contractId, allowedPath) {
  return {
    contract_id: contractId,
    objective: `Implement ${contractId}`,
    work_class: "repository-code-change",
    risk: "medium",
    read: [allowedPath],
    allowed_to_modify: [allowedPath],
    forbidden: ["opencode.json", ".opencode/**"],
    requirements: ["Preserve existing public behavior"],
    verification: {
      commands: ["npm test"],
      invariants: ["No files outside the contract change"],
    },
    budgets: {
      max_builder_attempts: 2,
      max_contract_revisions: 1,
      max_unplanned_scope_expansion: 0,
    },
    response: ["status", "changed files", "verification"],
  }
}

function validPlan() {
  return {
    schema_version: 1,
    plan_id: "parallel-example",
    objective: "Build two independent components and integrate them",
    base_revision: "0123456789abcdef",
    phases: [
      {
        phase_id: "users",
        objective: "Build users",
        depends_on: [],
        contracts: [contract("users-service", "src/users/service.js")],
      },
      {
        phase_id: "products",
        objective: "Build products",
        depends_on: [],
        contracts: [contract("products-service", "src/products/service.js")],
      },
      {
        phase_id: "integration",
        objective: "Integrate both components",
        depends_on: ["users", "products"],
        contracts: [contract("integration-api", "src/api.js")],
      },
    ],
  }
}

const workClasses = new Set(["repository-code-change"])

test("valid plan exposes parallel execution waves", () => {
  const result = validatePlan(validPlan(), { workClasses })

  assert.equal(result.valid, true)
  assert.deepEqual(result.execution_waves, [["users", "products"], ["integration"]])
})

test("validator rejects overlapping contracts that could run concurrently", () => {
  const plan = validPlan()
  plan.phases[1].contracts[0].allowed_to_modify = ["src/users/**"]
  const result = validatePlan(plan, { workClasses })

  assert.equal(result.valid, false)
  assert.match(result.errors.join("\n"), /parallel contracts .* overlap/)
})

test("validator rejects cycles, unknown work classes, and unsafe paths", () => {
  const plan = validPlan()
  plan.phases[0].depends_on = ["integration"]
  plan.phases[0].contracts[0].work_class = "invented-work"
  plan.phases[0].contracts[0].read = ["../secret"]
  const result = validatePlan(plan, { workClasses })

  assert.equal(result.valid, false)
  assert.match(result.errors.join("\n"), /dependency graph contains a cycle/)
  assert.match(result.errors.join("\n"), /unknown work_class invented-work/)
  assert.match(result.errors.join("\n"), /unsupported path pattern \.\.\/secret/)
})

test("path overlap is conservative for recursive directory patterns", () => {
  assert.equal(pathPatternsOverlap("src/users/**", "src/users/service.js"), true)
  assert.equal(pathPatternsOverlap("src/users/**", "src/products/service.js"), false)
})

test("validator accepts expected_baseline and final_verification, and can cap contracts per route", () => {
  const plan = validPlan()
  plan.final_verification = { commands: ["npm test"] }
  plan.phases[0].contracts[0].verification.expected_baseline = "pass"
  assert.equal(validatePlan(plan).valid, true)

  plan.phases[0].contracts[0].verification.expected_baseline = "maybe"
  assert.ok(validatePlan(plan).errors.some((error) => error.includes("expected_baseline")))

  const capped = validatePlan(validPlan(), { maxContracts: 1 })
  assert.equal(capped.valid, false)
  assert.ok(capped.errors.some((error) => error.includes("allows at most 1")))

  const badFinal = { ...validPlan(), final_verification: { commands: [""] } }
  assert.ok(validatePlan(badFinal).errors.includes("final_verification.commands must be an array of commands"))
})
