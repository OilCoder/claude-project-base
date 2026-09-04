import { eligibleConfigurations, roleStatus, validateRegistry } from "./model-selection.mjs"
import { summarizeEvents } from "./run-metrics.mjs"

const ZEN_RECHARGE_ACTION = "OpenCode Zen balance is exhausted. Recharge the Zen balance, then resume the run."
const GO_BALANCE_ACTION = "OpenCode Go reached a usage limit. Verify that Use balance is enabled in the OpenCode console."

function configurationView(configuration, role) {
  return {
    configuration_id: configuration.configuration_id,
    model: configuration.opencode_model,
    provider: configuration.provider,
    family: configuration.family,
    admission_status: roleStatus(configuration, role),
    context_tokens: configuration.capabilities?.context_tokens ?? null,
  }
}

// The policy name is the role: every runner asks for configurations admitted
// for its own role, in the order the role policy declares.
export function selectExecutionPlan(registry, role, request) {
  validateRegistry(registry)
  const policy = registry.runner_policies?.[role]
  if (!policy) throw new Error(`Registry does not define a ${role} runner policy`)

  const { eligible, rejected } = eligibleConfigurations(registry, { ...request, role })
  const primary = policy.configuration_ids
    .map((id) => eligible.find((configuration) => configuration.configuration_id === id))
    .find((configuration) => configuration && policy.providers.includes(configuration.provider))

  if (!primary) {
    return {
      status: "NO_MATCH",
      work_class: request.workClass,
      role,
      minimum_status: request.minimumStatus ?? "qualified",
      rejected,
    }
  }

  return {
    status: "READY",
    work_class: request.workClass,
    role,
    primary: configurationView(primary, role),
    rejected,
  }
}

export function selectBuilderExecutionPlan(registry, request) {
  return selectExecutionPlan(registry, "builder", {
    ...request,
    requiresCodeEditing: true,
    requiresTools: true,
  })
}
export function classifyExecution({
  exitCode,
  signal = null,
  eventsText = "",
  stderr = "",
  changedFiles = [],
}) {
  if (exitCode === 0) {
    return { classification: "SUCCESS", user_action: null }
  }
  if (changedFiles.length > 0) {
    return { classification: "PARTIAL_EXECUTION", user_action: null }
  }
  if (exitCode === 124 || signal) {
    return { classification: "LOCAL_RUNNER_ERROR", user_action: null }
  }

  const summary = summarizeEvents(eventsText)
  const error = summary.errors.at(-1)
  const statusCode = error?.status_code ?? null
  const name = error?.name ?? ""
  const message = error?.message ?? ""
  const searchable = `${name} ${message} ${stderr}`.toLowerCase()
  let classification = "UNCLASSIFIED_ERROR"
  let userAction = null

  if (statusCode === 401) classification = "AUTH_ERROR"
  else if (statusCode === 404) classification = "MODEL_CONFIG_ERROR"
  else if (
    /insufficient[_ -]?(?:credit|credits|balance)|credit balance|balance (?:is )?(?:empty|exhausted|depleted)|not (?:have|enough) (?:credits|balance)|out of credits|add credits|top[ -]?up|payment required/.test(
      searchable,
    )
  ) {
    classification = "ZEN_BALANCE_EXHAUSTED"
    userAction = ZEN_RECHARGE_ACTION
  }
  else if (statusCode === 429 || /rate limit|too many requests/.test(searchable)) {
    classification = "PROVIDER_RATE_LIMIT"
  } else if (/quota|usage limit/.test(searchable)) {
    classification = "GO_USAGE_LIMIT"
    userAction = GO_BALANCE_ACTION
  } else if (
    [500, 502, 503, 504, 529].includes(statusCode) ||
    /provider unavailable|service unavailable|overloaded|capacity temporarily unavailable/.test(
      searchable,
    )
  ) {
    classification = "PROVIDER_UNAVAILABLE"
  } else if (statusCode === 400 || /contextoverflow|structuredoutput/.test(searchable)) {
    classification = "MODEL_CONFIG_ERROR"
  }

  return {
    classification,
    user_action: userAction,
    status_code: statusCode,
    message: message || "Process failed without a classified provider error",
  }
}

export async function runExecutionPlan({ plan, execute }) {
  if (plan.status !== "READY") throw new Error("Execution plan is not ready")

  const result = await execute(plan.primary, 1)
  const classification = classifyExecution(result)
  return {
    status: classification.classification,
    user_action: classification.user_action,
    attempts: [attemptRecord(plan.primary, result, classification)],
  }
}

export async function runBuilderExecution(options) {
  return runExecutionPlan(options)
}

function attemptRecord(configuration, result, classification) {
  return {
    configuration,
    exit_code: result.exitCode,
    signal: result.signal ?? null,
    changed_files: result.changedFiles ?? [],
    metrics: summarizeEvents(result.eventsText ?? ""),
    // The tail of stderr travels with every attempt so an unclassified
    // failure can be diagnosed from the summary alone.
    stderr_tail: (result.stderr ?? "").trim().slice(-1500) || null,
    ...classification,
  }
}
