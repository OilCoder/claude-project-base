#!/usr/bin/env node

import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { validatePlan } from "../lib/plan-validation.mjs"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const systemRoot = path.resolve(scriptDirectory, "../../..")
const input = process.argv[2]

if (!input) {
  process.stderr.write("usage: validate-plan.mjs <plan.json>\n")
  process.exitCode = 2
} else {
  try {
    const registry = JSON.parse(
      await readFile(path.join(systemRoot, ".opencode/codegen/config/model-pools.json"), "utf8"),
    )
    const plan = JSON.parse(await readFile(path.resolve(input), "utf8"))
    const result = validatePlan(plan, { workClasses: new Set(Object.keys(registry.routes)) })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exitCode = result.valid ? 0 : 1
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
  }
}
