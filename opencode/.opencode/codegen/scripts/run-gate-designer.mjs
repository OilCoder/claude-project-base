#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { runExecutionPlan, selectExecutionPlan } from "../lib/builder-runner.mjs"
import {
  exists,
  loadRegistry,
  newRunId,
  parseArguments,
  requireGitHead,
  resolveMinimumStatus,
  resolvePinnedConfiguration,
} from "../lib/cli.mjs"
import { checkGateReadiness } from "../lib/gate.mjs"
import { agentRoles, resolveDisplay, runAgentProcess } from "../lib/agent-run.mjs"
import { runProcess } from "../lib/process.mjs"
import { changedFilesSince, revision } from "../lib/worktrees.mjs"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const systemRoot = path.resolve(scriptDirectory, "../../..")

// The Gate Designer writes tests with a configuration admitted for its own
// role and excludes the model family that will implement the contract.
async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.contract || !args["work-class"]) {
    throw new Error(
      "usage: run-gate-designer.mjs --contract <path> --work-class <class> [--risk <risk>] [--exclude-family <family>]",
    )
  }
  const directory = path.resolve(args.directory ?? process.cwd())
  await requireGitHead(directory)
  const minimumStatus = await resolveMinimumStatus(args, systemRoot)
  const configurationId = await resolvePinnedConfiguration(args, systemRoot)
  const contractPath = path.resolve(directory, args.contract)
  const contract = JSON.parse(await readFile(contractPath, "utf8"))
  const before = await checkGateReadiness({ directory, contract })
  if (before.ready) {
    const summary = { result: "ALREADY_READY", readiness: before, attempts: [] }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    return
  }
  if (!before.fixable) {
    const summary = { result: "NOT_FIXABLE", readiness: before, attempts: [] }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    process.exitCode = 1
    return
  }

  const registry = await loadRegistry(systemRoot)
  const plan = selectExecutionPlan(registry, "gate-designer", {
    workClass: args["work-class"],
    risk: args.risk ?? "low",
    minimumStatus,
    configurationId,
    requiredContext: Number(args["required-context"] ?? 0),
    requiresTools: true,
    requiresCodeEditing: true,
    excludeFamily: args["exclude-family"] ?? null,
  })
  if (plan.status !== "READY") {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
    process.exitCode = 2
    return
  }

  const runId = newRunId()
  const artifacts = path.join(systemRoot, ".opencode/codegen/runs/gate-designer", runId)
  await mkdir(artifacts, { recursive: true })
  const display = resolveDisplay(args)
  const roles = await agentRoles("gate-designer")
  const baseline = await revision(directory)
  const prompt = [
    `Prepare the Gate for the sealed contract at ${path.relative(directory, contractPath)}.`,
    `Readiness check reported: ${before.reasons.join(", ")}.`,
    "Write checks only under .codegen-contract/ and make .codegen-contract/gate.sh run them so the Gate fails on the current baseline and passes once the contract requirements are met.",
    "Do not implement the product change. If a trustworthy Gate cannot be built, report BLOCKED.",
  ].join("\n")

  const execution = await runExecutionPlan({
    plan,
    execute: async (configuration, attemptNumber) => {
      const result = await runAgentProcess({
        directory,
        args: ["run", "--format", "json", "--model", configuration.model, "--agent", "gate-designer", prompt],
        timeoutSeconds: Number(args.timeout ?? 900),
        display,
        artifacts,
        header: {
          title: `gate-designer · ${contract.contract_id ?? "contrato"}`,
          agent: "gate-designer",
          roles,
          run_id: runId,
          attempt: attemptNumber,
          model: configuration.model,
          context_tokens: configuration.context_tokens,
          lines: [`contrato  ${path.relative(directory, contractPath)}`, `motivo    ${before.reasons.join(", ")}`],
        },
      })
      return {
        exitCode: result.exitCode,
        signal: result.signal,
        eventsText: result.stdout,
        stderr: result.stderr,
        changedFiles: await changedFilesSince(directory, baseline),
      }
    },
  })

  let result = execution.status
  const changed = execution.attempts.at(-1)?.changed_files ?? []
  const outsideScope = changed.filter((file) => !file.startsWith(".codegen-contract/"))
  let after = null
  if (result === "SUCCESS" && outsideScope.length > 0) result = "SCOPE_FAIL"
  if (result === "SUCCESS") {
    if (changed.length === 0) {
      result = /\bBLOCKED\b/i.test(execution.attempts.at(-1).metrics.final_text)
        ? "CONTRACT_BLOCKED"
        : "NO_CHANGES"
    } else {
      const refreshed = (await exists(contractPath))
        ? JSON.parse(await readFile(contractPath, "utf8"))
        : contract
      after = await checkGateReadiness({ directory, contract: refreshed })
      result = after.ready ? "GATE_READY" : "GATE_NOT_READY"
    }
  }

  const summary = {
    result,
    contract: path.relative(directory, contractPath),
    readiness_before: before,
    readiness_after: after,
    changed_files: changed,
    outside_scope: outsideScope,
    user_action: execution.user_action,
    attempts: execution.attempts,
    artifacts,
  }
  await writeFile(path.join(artifacts, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  process.exitCode = result === "GATE_READY" ? 0 : 1
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
})
