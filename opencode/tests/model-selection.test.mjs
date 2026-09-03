import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
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

test("production selection rejects a pool with no qualified configurations", () => {
  const result = selectModel(registry, {
    workClass: "localized-low-risk-code-change",
    risk: "low",
    requiresCodeEditing: true,
  })

  assert.equal(result.status, "NO_MATCH")
  assert.equal(result.minimum_status, "qualified")
})

test("candidate admission follows the Go-first route", () => {
  const result = selectModel(registry, {
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
  const openrouter = registry.configurations.find(
    ({ configuration_id }) => configuration_id === "builder-cloud-minimax-m2.5",
  )

  assert.equal(zen.provider, "opencode")
  assert.match(zen.opencode_model, /^opencode\//)
  assert.equal(openrouter.provider, "openrouter")
  assert.match(openrouter.opencode_model, /^openrouter\//)
  const routedProviders = Object.values(registry.routes).flat().map((id) =>
    registry.configurations.find((item) => item.configuration_id === id).provider,
  )
  assert.ok(routedProviders.includes("opencode-go"))
  assert.ok(routedProviders.includes("opencode"))
  assert.ok(!routedProviders.includes("openrouter"))
})

test("high-risk work escalates to a Zen-only model when candidate Go models are insufficient", () => {
  const result = selectModel(registry, {
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
    () => selectModel(registry, { workClass: "invented-work" }),
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
