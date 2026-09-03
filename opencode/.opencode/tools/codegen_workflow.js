import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"

import { tool } from "@opencode-ai/plugin"

const executeFile = promisify(execFile)
const operations = new Set(["draft", "approve", "orchestrate"])

export default tool({
  description:
    "Run the controlled code-generation workflow. Draft a Goal from user intent, approve the existing Goal after explicit user confirmation, or orchestrate an approved Goal.",
  args: {
    operation: tool.schema.string().describe("draft, approve, or orchestrate"),
    intent: tool.schema.string().optional().describe("Complete user intent; required only for draft"),
    goal: tool.schema.string().optional().describe("Goal path; defaults to .codegen-goal/goal.json"),
  },
  async execute(args, context) {
    if (!operations.has(args.operation)) throw new Error("operation must be draft, approve, or orchestrate")
    if (args.operation === "draft" && !args.intent?.trim()) throw new Error("draft requires non-empty intent")

    const goal = args.goal ?? ".codegen-goal/goal.json"
    const codegen = path.join(context.directory, ".opencode", "codegen", "scripts")
    let script
    let scriptArgs
    if (args.operation === "draft") {
      script = "run-goal.mjs"
      scriptArgs = ["--intent", args.intent, "--output", goal]
    } else if (args.operation === "approve") {
      script = "run-goal.mjs"
      scriptArgs = ["--approve", goal]
    } else {
      script = "orchestrate.mjs"
      scriptArgs = ["--goal", goal]
    }

    try {
      const result = await executeFile(process.execPath, [path.join(codegen, script), ...scriptArgs], {
        cwd: context.directory,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60 * 60 * 1000,
      })
      return result.stdout.trim() || JSON.stringify({ result: "OK", operation: args.operation })
    } catch (error) {
      const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim()
      throw new Error(`Controlled workflow ${args.operation} failed:\n${detail}`)
    }
  },
})
