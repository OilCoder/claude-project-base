#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { renderGoalMarkdown, validateGoal } from "../lib/goal.mjs"
import { routeGoal } from "../lib/goal-routing.mjs"

const [command, input, output] = process.argv.slice(2)

if (!command || !input || !new Set(["validate", "render", "route"]).has(command)) {
  process.stderr.write("usage: goal.mjs <validate|render|route> <goal.json> [GOAL.md]\n")
  process.exitCode = 2
} else {
  try {
    const goal = JSON.parse(await readFile(path.resolve(input), "utf8"))
    if (command === "validate") {
      const result = validateGoal(goal)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      process.exitCode = result.valid ? 0 : 1
    } else if (command === "route") {
      const result = routeGoal(goal)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      process.exitCode = result.status === "ROUTED" ? 0 : 1
    } else {
      const destination = path.resolve(output ?? path.join(path.dirname(input), "GOAL.md"))
      await writeFile(destination, renderGoalMarkdown(goal))
      process.stdout.write(`${destination}\n`)
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
  }
}
