import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  roleStatus,
  selectModel,
  validateRegistry,
} from "../.opencode/codegen/lib/model-selection.mjs"
import { summarizeEvents } from "../.opencode/codegen/lib/run-metrics.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const registry = JSON.parse(
  await readFile(
    path.join(here, "..", ".opencode", "codegen", "config", "model-pools.json"),
    "utf8",
  ),
)

test("registry is internally consistent", () => {
  assert.doesNotThrow(() => validateRegistry(registry))
})

function uncertified() {
  const copy = structuredClone(registry)
  for (const configuration of copy.configurations) delete configuration.admission?.roles
  return copy
}

test("production selection rejects a role with no qualified configurations", () => {
  const result = selectModel(uncertified(), {
    role: "builder",
    workClass: "localized-low-risk-code-change",
    risk: "low",
    requiresCodeEditing: true,
  })

  assert.equal(result.status, "NO_MATCH")
  assert.equal(result.minimum_status, "qualified")
  assert.ok(result.rejected.every((item) => item.reasons.some((reason) => reason.startsWith("admission:builder:"))))
})

test("qualified is recorded per role and never at catalog level", () => {
  const copy = uncertified()
  const builder = copy.configurations.find((item) => item.configuration_id === "builder-go-minimax-m3")
  builder.admission.roles = { builder: { status: "qualified", certified_at: "2026-09-03T00:00:00Z", evidence: { run_id: "r" } } }
  assert.equal(roleStatus(builder, "builder"), "qualified")
  assert.equal(roleStatus(builder, "planner"), "candidate")
  assert.equal(selectModel(copy, { role: "builder", workClass: "localized-low-risk-code-change", requiresCodeEditing: true }).status, "SELECTED")
  assert.equal(selectModel(copy, { role: "planner", workClass: "complex-engineering-plan" }).status, "NO_MATCH")

  builder.status = "qualified"
  assert.throws(() => validateRegistry(copy), /catalog status must be one of/)
  builder.status = "candidate"
  builder.admission.roles = { builder: { status: "qualified" } }
  assert.throws(() => validateRegistry(copy), /without certification evidence/)
  builder.admission.roles = { supervisor: { status: "candidate" } }
  assert.throws(() => validateRegistry(copy), /unknown role/)
})

test("a pinned configuration must still pass every admission filter", () => {
  const pinned = selectModel(registry, {
    role: "builder",
    workClass: "localized-low-risk-code-change",
    minimumStatus: "candidate",
    requiresCodeEditing: true,
    configurationId: "builder-go-mimo-v2.5-pro",
  })
  assert.equal(pinned.selection.configuration_id, "builder-go-mimo-v2.5-pro")
  const tooRisky = selectModel(registry, {
    role: "builder",
    workClass: "localized-low-risk-code-change",
    risk: "medium",
    minimumStatus: "candidate",
    requiresCodeEditing: true,
    configurationId: "builder-local-gpt-oss-64k",
  })
  assert.equal(tooRisky.status, "NO_MATCH")
  assert.throws(() => selectModel(registry, { workClass: "localized-low-risk-code-change" }), /role must be one of/)
})

test("candidate admission follows the Go-first route", () => {
  const result = selectModel(registry, {
    role: "builder",
    workClass: "localized-low-risk-code-change",
    risk: "low",
    minimumStatus: "candidate",
    requiresCodeEditing: true,
  })

  assert.equal(result.status, "SELECTED")
  assert.equal(result.selection.configuration_id, "builder-go-minimax-m3")
  assert.equal(result.alternate.configuration_id, "builder-go-mimo-v2.5-pro")
  assert.equal(result.selection.provider, "opencode-go")
  assert.equal(result.selection.availability, "not-checked")
})

test("risk and context filters remove an insufficient local configuration", () => {
  const result = selectModel(registry, {
    role: "builder",
    workClass: "localized-low-risk-code-change",
    risk: "medium",
    minimumStatus: "candidate",
    requiredContext: 100000,
    requiresCodeEditing: true,
  })

  assert.equal(result.status, "SELECTED")
  assert.equal(result.selection.configuration_id, "builder-go-minimax-m3")
})

test("automatic routes contain Go and Zen but exclude OpenRouter", () => {
  const zen = registry.configurations.find(
    ({ configuration_id }) => configuration_id === "builder-zen-minimax-m3",
  )
  assert.equal(zen.provider, "opencode")
  assert.match(zen.opencode_model, /^opencode\//)
  // OpenRouter configurations were removed from the registry on 2026-09-03.
  assert.equal(registry.configurations.filter((item) => item.provider === "openrouter").length, 0)
  const routedProviders = Object.values(registry.routes).flat().map((id) =>
    registry.configurations.find((item) => item.configuration_id === id).provider,
  )
  assert.ok(routedProviders.includes("opencode-go"))
  assert.ok(routedProviders.includes("opencode"))
  assert.ok(!routedProviders.includes("openrouter"))
})

test("high-risk work escalates to a Zen-only model when candidate Go models are insufficient", () => {
  const result = selectModel(registry, {
    role: "builder",
    workClass: "repository-code-change",
    risk: "high",
    minimumStatus: "candidate",
    requiresCodeEditing: true,
  })

  assert.equal(result.status, "SELECTED")
  assert.equal(result.selection.configuration_id, "builder-zen-claude-opus-5")
  assert.equal(result.selection.provider, "opencode")
})

test("Zen routing omits GPT Sol when authenticated OpenAI already supplies it", () => {
  assert.ok(!registry.configurations.some((item) => item.opencode_model === "opencode/gpt-5.6-sol"))
  assert.ok(registry.configurations.some((item) => item.opencode_model === "opencode-go/deepseek-v4-flash"))
})

test("family exclusion preserves independent analysis", () => {
  const result = selectModel(registry, {
    role: "advisor",
    workClass: "independent-analysis",
    risk: "medium",
    minimumStatus: "candidate",
    excludeFamily: "claude",
  })

  assert.equal(result.status, "SELECTED")
  assert.equal(result.selection.configuration_id, "builder-go-gpt-5.6-luna")
  assert.notEqual(result.selection.family, "claude")
})

test("unknown work classes fail explicitly", () => {
  assert.throws(
    () => selectModel(registry, { role: "builder", workClass: "invented-work" }),
    /Unknown workClass/,
  )
})

test("OpenCode events are summarized without retaining provider headers", () => {
  const summary = summarizeEvents(
    [
      JSON.stringify({
        type: "step_finish",
        part: {
          cost: 0.25,
          tokens: {
            input: 100,
            output: 20,
            reasoning: 5,
            cache: { read: 10, write: 2 },
          },
        },
      }),
      JSON.stringify({ type: "text", part: { text: "Final safe status" } }),
      JSON.stringify({
        type: "error",
        error: {
          name: "APIError",
          data: {
            statusCode: 401,
            message: "User not found.",
            isRetryable: false,
            responseHeaders: { "set-cookie": "must-not-be-retained" },
          },
        },
      }),
    ].join("\n"),
  )

  assert.equal(summary.steps, 1)
  assert.equal(summary.input_tokens, 100)
  assert.equal(summary.reported_cost, 0.25)
  assert.equal(summary.final_text, "Final safe status")
  assert.deepEqual(summary.errors, [
    {
      name: "APIError",
      status_code: 401,
      message: "User not found.",
      retryable: false,
    },
  ])
  assert.equal(JSON.stringify(summary).includes("set-cookie"), false)
})
