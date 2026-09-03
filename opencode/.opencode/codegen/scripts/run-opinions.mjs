#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { classifyExecution } from "../lib/builder-runner.mjs"
import { exists, loadRegistry, newRunId, parseArguments, resolveInsideProject } from "../lib/cli.mjs"
import { validateGoal } from "../lib/goal.mjs"
import { eligibleConfigurations } from "../lib/model-selection.mjs"
import {
  reconcileOpinions,
  renderDecisionMarkdown,
  unanimousDecision,
  validateDecision,
  validateOpinion,
} from "../lib/opinions.mjs"
import { agentRoles, resolveDisplay, runAgentProcess } from "../lib/agent-run.mjs"
import { runProcess } from "../lib/process.mjs"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const systemRoot = path.resolve(scriptDirectory, "../../..")

function view(configuration) {
  return {
    configuration_id: configuration.configuration_id,
    model: configuration.opencode_model,
    provider: configuration.provider,
    family: configuration.family,
    admission_status: configuration.status,
  }
}

async function runAgent({ directory, agent, model, prompt, timeoutSeconds, output, display, artifacts, header }) {
  const result = await runAgentProcess({
    directory,
    args: ["run", "--format", "json", "--model", model, "--agent", agent, prompt],
    timeoutSeconds,
    display,
    artifacts,
    header: { agent, roles: await agentRoles(agent), model, ...header },
  })
  const written = await exists(output)
  return {
    written,
    exit_code: result.exitCode,
    signal: result.signal,
    ...classifyExecution({
      exitCode: result.exitCode,
      signal: result.signal,
      eventsText: result.stdout,
      stderr: result.stderr,
      changedFiles: written ? [output] : [],
    }),
  }
}

// Advisors run once each on distinct OpenCode Go model families. Unanimity is
// decided deterministically; divergence goes to a third Go family.
async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.question) {
    throw new Error(
      "usage: run-opinions.mjs --question <open_question_id> [--goal .codegen-goal/goal.json] [--advisors 2] [--minimum-status <status>]",
    )
  }
  const directory = path.resolve(args.directory ?? process.cwd())
  const goalFile = resolveInsideProject(directory, args.goal ?? ".codegen-goal/goal.json", "Goal")
  const goal = JSON.parse(await readFile(goalFile.absolute, "utf8"))
  const goalValidation = validateGoal(goal)
  if (!goalValidation.valid) throw new Error(`Goal is invalid: ${goalValidation.errors.join("; ")}`)
  const question = goal.open_questions.find((item) => item.id === args.question)
  if (!question) throw new Error(`Goal does not define open question ${args.question}`)
  if (!Array.isArray(question.options) || question.options.length < 2) {
    throw new Error(`Open question ${question.id} has no closed option set; add options before deliberation`)
  }
  const advisorCount = Number(args.advisors ?? 2)
  const outputDirectory = resolveInsideProject(directory, `.codegen-opinions/${question.id}`, "Opinions output")
  if (await exists(outputDirectory.absolute)) {
    throw new Error(`Opinions output already exists: ${outputDirectory.relative}`)
  }

  const registry = await loadRegistry(systemRoot)
  const request = {
    workClass: "independent-analysis",
    risk: goal.routing.risk,
    minimumStatus: args["minimum-status"] ?? "qualified",
    requiredContext: Number(args["required-context"] ?? 0),
    requiresTools: true,
    requiresCodeEditing: false,
  }
  const { eligible, rejected } = eligibleConfigurations(registry, request)
  const byFamily = new Map()
  for (const configuration of eligible) {
    if (!byFamily.has(configuration.family)) byFamily.set(configuration.family, configuration)
  }
  const independent = [...byFamily.values()]
  if (independent.length < advisorCount + 1) {
    const summary = {
      result: "INSUFFICIENT_INDEPENDENCE",
      question_id: question.id,
      reason: `${independent.length} eligible model families; need ${advisorCount} advisors plus a reconciler family`,
      families: independent.map((configuration) => configuration.family),
      rejected,
    }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    process.exitCode = 2
    return
  }
  const advisors = independent.slice(0, advisorCount)
  const reconciler = independent[advisorCount]

  await mkdir(outputDirectory.absolute, { recursive: true })
  const runId = newRunId()
  const artifacts = path.join(systemRoot, ".opencode/codegen/runs/opinions", runId)
  await mkdir(artifacts, { recursive: true })
  const display = resolveDisplay(args)
  const timeoutSeconds = Number(args.timeout ?? 600)
  const attempts = []
  const opinions = []
  let userAction = null

  for (const configuration of advisors) {
    const opinionId = `${question.id}-${configuration.family}`
    const output = path.join(outputDirectory.relative, `${opinionId}.json`)
    const prompt = [
      `Give your independent opinion on open question ${question.id} from ${goalFile.relative}: ${question.question}`,
      `Listed options: ${question.options.map((option) => `"${option}"`).join(", ")}.`,
      `Write the opinion to ${output} with opinion_id "${opinionId}", copying question_id, question, and options verbatim.`,
    ].join("\n")
    const run = await runAgent({
      directory,
      agent: "advisor",
      model: configuration.opencode_model,
      prompt,
      timeoutSeconds,
      output: path.join(directory, output),
      display,
      artifacts,
      header: {
        title: `advisor · ${question.id} · ${configuration.family}`,
        run_id: runId,
        context_tokens: configuration.capabilities?.context_tokens ?? null,
        lines: [`pregunta  ${question.question}`, `opciones  ${question.options.join(" | ")}`],
      },
    })
    const attempt = { role: "advisor", configuration: view(configuration), output, ...run, validation: null }
    attempts.push(attempt)
    if (run.user_action) {
      userAction = run.user_action
      break
    }
    if (run.classification !== "SUCCESS" || !run.written) continue
    try {
      const opinion = JSON.parse(await readFile(path.join(directory, output), "utf8"))
      attempt.validation = validateOpinion(opinion, question)
      if (attempt.validation.valid) opinions.push({ opinion, family: configuration.family })
    } catch (error) {
      attempt.validation = { valid: false, errors: [`Opinion is not valid JSON: ${error.message}`] }
    }
  }

  const reconciliation = userAction
    ? { status: "USER_ACTION_REQUIRED", reason: userAction }
    : reconcileOpinions(opinions, { minOpinions: advisorCount })
  let decision = null
  let decisionValidation = null
  let result = reconciliation.status
  const decisionId = `DEC-${question.id}`
  const decisionOutput = path.join(outputDirectory.relative, "decision.json")

  if (reconciliation.status === "UNANIMOUS") {
    decision = unanimousDecision({ question, opinions: opinions.map((item) => item.opinion), decisionId })
    await writeFile(path.join(directory, decisionOutput), `${JSON.stringify(decision, null, 2)}\n`)
  } else if (reconciliation.status === "DIVERGENT") {
    const prompt = [
      `Reconcile the divergent opinions on open question ${question.id} from ${goalFile.relative}: ${question.question}`,
      `Listed options: ${question.options.map((option) => `"${option}"`).join(", ")}.`,
      `Opinion files: ${attempts.filter((attempt) => attempt.validation?.valid).map((attempt) => attempt.output).join(", ")}.`,
      `Write the proposed decision to ${decisionOutput} with decision_id "${decisionId}", method "reconciled", citing every opinion and explaining each rejected position.`,
    ].join("\n")
    const run = await runAgent({
      directory,
      agent: "reconciler",
      model: reconciler.opencode_model,
      prompt,
      timeoutSeconds,
      output: path.join(directory, decisionOutput),
      display,
      artifacts,
      header: {
        title: `reconciler · ${question.id} · ${reconciler.family}`,
        run_id: runId,
        context_tokens: reconciler.capabilities?.context_tokens ?? null,
        lines: [`pregunta  ${question.question}`, `posiciones ${reconciliation.tally.map((t) => `${t.position} (${t.opinion_ids.join(",")})`).join(" | ")}`],
      },
    })
    attempts.push({ role: "reconciler", configuration: view(reconciler), output: decisionOutput, ...run })
    if (run.user_action) {
      userAction = run.user_action
      result = "USER_ACTION_REQUIRED"
    } else if (run.classification === "SUCCESS" && run.written) {
      try {
        decision = JSON.parse(await readFile(path.join(directory, decisionOutput), "utf8"))
      } catch (error) {
        decisionValidation = { valid: false, errors: [`Decision is not valid JSON: ${error.message}`] }
      }
    } else {
      result = run.written ? run.classification : "RECONCILER_FAILED"
    }
  }

  if (decision) {
    decisionValidation = validateDecision(decision, { question, opinions: opinions.map((item) => item.opinion) })
    if (decisionValidation.valid) {
      result = "DECISION_PROPOSED"
      await writeFile(
        path.join(directory, outputDirectory.relative, "DECISION.md"),
        renderDecisionMarkdown(decision, opinions.map((item) => item.opinion)),
      )
    } else {
      result = "DECISION_INVALID"
    }
  }

  const summary = {
    result,
    question_id: question.id,
    output: outputDirectory.relative,
    reconciliation,
    decision: decisionValidation?.valid ? decisionOutput : null,
    decision_validation: decisionValidation,
    user_action: userAction,
    attempts,
    artifacts,
  }
  await writeFile(path.join(artifacts, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  process.exitCode = result === "DECISION_PROPOSED" ? 0 : 1
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
})
