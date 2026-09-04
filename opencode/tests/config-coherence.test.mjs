// opencode.json and model-pools.json describe the same models from two sides.
// This keeps them from drifting: every registry configuration must be
// reachable through the provider configuration OpenCode loads, automatic
// routes stay on OpenCode providers, and every enabled provider is defined.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { ROLES } from "../.opencode/codegen/lib/model-selection.mjs"

const config = JSON.parse(await readFile(new URL("../opencode.json", import.meta.url), "utf8"))
const registry = JSON.parse(await readFile(new URL("../.opencode/codegen/config/model-pools.json", import.meta.url), "utf8"))
const BUILTIN_PROVIDERS = new Set(["opencode", "opencode-go", "openai", "anthropic", "openrouter", "ollama"])

test("every registry configuration is whitelisted (or declared) by its provider in opencode.json", () => {
  for (const configuration of registry.configurations) {
    const [provider, ...rest] = configuration.opencode_model.split("/")
    const model = rest.join("/")
    assert.equal(provider, configuration.provider, `${configuration.configuration_id}: provider mismatch`)
    assert.ok(config.enabled_providers.includes(provider), `${configuration.configuration_id}: provider ${provider} is not enabled`)
    const block = config.provider?.[provider] ?? {}
    const declared = block.whitelist ?? Object.keys(block.models ?? {})
    assert.ok(declared.includes(model), `${configuration.configuration_id}: ${model} is not whitelisted for ${provider}`)
  }
})

test("automatic routes use OpenCode providers only; OpenRouter is manual", () => {
  for (const role of ROLES) {
    const policy = registry.runner_policies[role]
    assert.ok(policy, `runner policy for ${role}`)
    assert.deepEqual(policy.providers.filter((p) => !["opencode-go", "opencode"].includes(p)), [], `${role} routes outside OpenCode`)
    for (const id of policy.configuration_ids) {
      assert.ok(registry.configurations.some((c) => c.configuration_id === id), `${role} policy references unknown ${id}`)
    }
  }
  assert.equal(registry.configurations.filter((c) => c.provider === "openrouter").length, 0)
})

test("every enabled provider is a built-in provider or has a provider block", () => {
  for (const provider of config.enabled_providers) {
    assert.ok(BUILTIN_PROVIDERS.has(provider) || config.provider?.[provider], `${provider} is enabled but undefined`)
  }
  assert.ok(!config.enabled_providers.includes("openai"), "openai has no configuration in the registry and was removed from enabled_providers")
})
