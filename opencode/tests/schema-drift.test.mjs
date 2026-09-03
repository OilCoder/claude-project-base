import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { validateGoal } from "../.opencode/codegen/lib/goal.mjs"
import { validateDecision, validateOpinion } from "../.opencode/codegen/lib/opinions.mjs"
import { validateResearchReport } from "../.opencode/codegen/lib/research-report.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const schemaDirectory = path.resolve(here, "../.opencode/codegen/schema")

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"))
}

// Guards the hand-written validators against drifting away from the JSON
// schemas: every top-level required field must be enforced by the validator.
for (const [schemaFile, fixtureFile, validate] of [
  ["goal.schema.json", "goal-research/goal.json", validateGoal],
  ["research-report.schema.json", "goal-research/report.json", validateResearchReport],
  ["opinion.schema.json", "opinions/opinion.json", validateOpinion],
  ["decision.schema.json", "opinions/decision.json", validateDecision],
]) {
  test(`${schemaFile} required fields are enforced by the validator`, async () => {
    const schema = await json(path.join(schemaDirectory, schemaFile))
    const fixture = await json(path.join(here, "fixtures", fixtureFile))
    assert.equal(validate(fixture).valid, true)
    for (const field of schema.required) {
      const candidate = { ...fixture }
      delete candidate[field]
      assert.equal(validate(candidate).valid, false, `validator accepted missing ${field}`)
    }
    for (const field of Object.keys(fixture)) {
      assert.ok(field in schema.properties, `fixture field ${field} is not in the schema`)
    }
  })
}
