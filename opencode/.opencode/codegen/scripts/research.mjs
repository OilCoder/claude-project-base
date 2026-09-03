#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { renderResearchMarkdown, validateResearchReport } from "../lib/research-report.mjs"

const [command, input, ...rest] = process.argv.slice(2)

function usage() {
  process.stderr.write(
    "usage: research.mjs validate <report.json> [<goal.json> <question_id>]\n" +
      "       research.mjs render <report.json> [REPORT.md]\n",
  )
  process.exitCode = 2
}

if (!command || !input || !new Set(["validate", "render"]).has(command)) {
  usage()
} else {
  try {
    const report = JSON.parse(await readFile(path.resolve(input), "utf8"))
    if (command === "validate") {
      let question = null
      if (rest.length > 0) {
        const [goalPath, questionId] = rest
        if (!goalPath || !questionId) throw new Error("validate needs <goal.json> <question_id>")
        const goal = JSON.parse(await readFile(path.resolve(goalPath), "utf8"))
        question = (goal.research_questions ?? []).find((item) => item.id === questionId) ?? null
        if (!question) throw new Error(`Goal does not define research question ${questionId}`)
      }
      const result = validateResearchReport(report, question)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      process.exitCode = result.valid ? 0 : 1
    } else {
      const destination = path.resolve(
        rest[0] ?? path.join(path.dirname(input), `${path.basename(input, ".json")}.md`),
      )
      await writeFile(destination, renderResearchMarkdown(report))
      process.stdout.write(`${destination}\n`)
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
  }
}
