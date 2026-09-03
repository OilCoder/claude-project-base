const STATUS_RANK = {
  deprecated: 0,
  watch: 1,
  candidate: 2,
  qualified: 3,
}

// Catalog status is capped at candidate. `qualified` exists only per role,
// recorded by the certification process of the harness repository.
const CATALOG_STATUSES = ["deprecated", "watch", "candidate"]

const RISK_RANK = {
  low: 0,
  medium: 1,
  high: 2,
}

// Roles that request configurations from the registry. The supervisor is the
// user's own interactive model and is never selected here.
export const ROLES = [
  "goal-manager",
  "planner",
  "gate-designer",
  "builder",
  "researcher",
  "advisor",
  "reconciler",
]

export const MINIMUM_STATUSES = ["watch", "candidate", "qualified"]

function requireEnum(value, values, label) {
  if (!values.includes(value)) {
    throw new Error(`${label} must be one of: ${values.join(", ")}`)
  }
}

// Admission is decided per role: a configuration certified as Builder is not
// thereby admitted as Planner. Without a role entry the catalog status applies,
// which can never be qualified.
export function roleStatus(configuration, role) {
  const entry = configuration.admission?.roles?.[role]
  return entry?.status ?? configuration.status
}

export function validateRegistry(registry) {
  if (registry?.schema_version !== 1) {
    throw new Error("Unsupported model-pool schema_version")
  }
  if (!registry.routes || !Array.isArray(registry.configurations)) {
    throw new Error("Registry must define routes and configurations")
  }

  const ids = new Set()
  for (const configuration of registry.configurations) {
    if (!configuration.configuration_id || ids.has(configuration.configuration_id)) {
      throw new Error(`Missing or duplicate configuration_id: ${configuration.configuration_id}`)
    }
    ids.add(configuration.configuration_id)
    if (!CATALOG_STATUSES.includes(configuration.status)) {
      throw new Error(
        `Configuration ${configuration.configuration_id}: catalog status must be one of ${CATALOG_STATUSES.join(", ")}; qualified is recorded per role under admission.roles`,
      )
    }
    requireEnum(configuration.constraints?.max_risk, Object.keys(RISK_RANK), "max_risk")
    if (!configuration.provider || !configuration.opencode_model?.startsWith(`${configuration.provider}/`)) {
      throw new Error(
        `Configuration ${configuration.configuration_id} must use its provider as model prefix`,
      )
    }
    for (const [role, entry] of Object.entries(configuration.admission?.roles ?? {})) {
      if (!ROLES.includes(role)) {
        throw new Error(`Configuration ${configuration.configuration_id} admits unknown role: ${role}`)
      }
      requireEnum(entry?.status, Object.keys(STATUS_RANK), `${configuration.configuration_id} ${role} status`)
      if (entry.status === "qualified" && (!entry.certified_at || !entry.evidence?.run_id)) {
        throw new Error(
          `Configuration ${configuration.configuration_id} is qualified as ${role} without certification evidence`,
        )
      }
    }
  }

  for (const [workClass, route] of Object.entries(registry.routes)) {
    if (!Array.isArray(route) || route.length === 0) {
      throw new Error(`Route ${workClass} must contain configurations`)
    }
    for (const id of route) {
      if (!ids.has(id)) {
        throw new Error(`Route ${workClass} references unknown configuration: ${id}`)
      }
      const configuration = registry.configurations.find(
        (candidate) => candidate.configuration_id === id,
      )
      if (!configuration.work_classes.includes(workClass)) {
        throw new Error(`Configuration ${id} does not declare work class: ${workClass}`)
      }
    }
  }

  for (const [policyName, policy] of Object.entries(registry.runner_policies ?? {})) {
    if (!ROLES.includes(policyName)) {
      throw new Error(`Runner policy ${policyName} is not a registry role`)
    }
    if (!Array.isArray(policy.providers) || policy.providers.length === 0 || !Array.isArray(policy.configuration_ids) || policy.configuration_ids.length === 0) {
      throw new Error(`${policyName} policy must define providers and configuration_ids`)
    }
    for (const configurationId of policy.configuration_ids) {
      const configuration = registry.configurations.find(
        (candidate) => candidate.configuration_id === configurationId,
      )
      if (!configuration) {
        throw new Error(`${policyName} policy references an unknown configuration: ${configurationId}`)
      }
      if (!policy.providers.includes(configuration.provider)) {
        throw new Error(`${policyName} configuration ${configurationId} has provider ${configuration.provider}`)
      }
    }
  }
}

export function eligibleConfigurations(registry, request) {
  validateRegistry(registry)

  const workClass = request.workClass
  const role = request.role
  const risk = request.risk ?? "low"
  const minimumStatus = request.minimumStatus ?? "qualified"
  const requiredContext = request.requiredContext ?? 0
  const requiresTools = request.requiresTools ?? true
  const requiresCodeEditing = request.requiresCodeEditing ?? false
  const excludeFamily = request.excludeFamily ?? null
  const configurationId = request.configurationId ?? null

  requireEnum(role, ROLES, "role")
  requireEnum(risk, Object.keys(RISK_RANK), "risk")
  requireEnum(minimumStatus, MINIMUM_STATUSES, "minimumStatus")
  if (!Number.isInteger(requiredContext) || requiredContext < 0) {
    throw new Error("requiredContext must be a non-negative integer")
  }

  const route = registry.routes[workClass]
  if (!route) {
    throw new Error(`Unknown workClass: ${workClass}`)
  }

  const byId = new Map(
    registry.configurations.map((configuration) => [configuration.configuration_id, configuration]),
  )
  const rejected = []
  const eligible = []

  for (const id of route) {
    const configuration = byId.get(id)
    const reasons = []
    const status = roleStatus(configuration, role)

    if (!configuration.enabled) reasons.push("disabled")
    if (STATUS_RANK[status] < STATUS_RANK[minimumStatus]) {
      reasons.push(`admission:${role}:${status}`)
    }
    if (RISK_RANK[configuration.constraints.max_risk] < RISK_RANK[risk]) {
      reasons.push(`risk-ceiling:${configuration.constraints.max_risk}`)
    }
    if (configuration.capabilities.context_tokens < requiredContext) {
      reasons.push(`context:${configuration.capabilities.context_tokens}`)
    }
    if (requiresTools && !configuration.capabilities.tool_calling) {
      reasons.push("missing-tool-calling")
    }
    if (requiresCodeEditing && !configuration.capabilities.code_editing) {
      reasons.push("missing-code-editing")
    }
    if (excludeFamily && configuration.family === excludeFamily) {
      reasons.push(`excluded-family:${excludeFamily}`)
    }
    if (configurationId && configuration.configuration_id !== configurationId) {
      reasons.push(`pinned:${configurationId}`)
    }

    if (reasons.length > 0) {
      rejected.push({ configuration_id: id, reasons })
    } else {
      eligible.push(configuration)
    }
  }

  return { eligible, rejected }
}

export function selectionView(configuration, role = null) {
  return {
    configuration_id: configuration.configuration_id,
    model: configuration.opencode_model,
    provider: configuration.provider,
    family: configuration.family,
    admission_status: role ? roleStatus(configuration, role) : configuration.status,
    context_tokens: configuration.capabilities?.context_tokens ?? null,
    availability: "not-checked",
  }
}

export function selectModel(registry, request) {
  const workClass = request.workClass
  const role = request.role
  const minimumStatus = request.minimumStatus ?? "qualified"
  const { eligible, rejected } = eligibleConfigurations(registry, request)

  if (eligible.length === 0) {
    return {
      status: "NO_MATCH",
      work_class: workClass,
      role,
      minimum_status: minimumStatus,
      rejected,
    }
  }

  const selected = eligible[0]
  const alternate = eligible[1] ?? null
  return {
    status: "SELECTED",
    work_class: workClass,
    role,
    selection: {
      ...selectionView(selected, role),
    },
    alternate: alternate ? selectionView(alternate, role) : null,
    warnings: [
      "The Runner must verify live provider and endpoint availability before execution.",
      ...(roleStatus(selected, role) !== "qualified"
        ? [`Selected configuration is not certified as ${role}; this selection is valid only for harness maintenance.`]
        : []),
    ],
    rejected,
  }
}
