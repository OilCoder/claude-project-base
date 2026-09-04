const RISKS = new Set(["low", "medium", "high"])
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@*+-]+(?:\/[A-Za-z0-9._/@*+-]+)*$/

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function validPathPattern(value) {
  if (!nonEmptyString(value)) return false
  if (value.endsWith("/**")) return SAFE_PATH.test(value.slice(0, -3))
  return SAFE_PATH.test(value) && !value.includes("*")
}

// `read` and `forbidden` are descriptive, so they also accept extension globs
// ("*.json", "**/*.md"); `allowed_to_modify` stays exact because it is what
// the orchestrator enforces and commits.
// A gate that asserts working-tree state (untracked files, diffs) passes in the
// builder's worktree and fails once the result is committed on the integration
// branch. Gates judge behavior and file contents only.
const GIT_STATE_COMMAND = /\bgit\s+(status|diff|ls-files|log|show)\b/

const EXTENSION_GLOB = /^(?:\*\*\/)?\*\.[A-Za-z0-9_.-]+$/
function validDescriptivePattern(value) {
  return validPathPattern(value) || (nonEmptyString(value) && EXTENSION_GLOB.test(value))
}

function extensionOf(pattern) {
  const match = EXTENSION_GLOB.test(pattern) ? pattern.match(/\*(\.[A-Za-z0-9_.-]+)$/) : null
  return match ? match[1] : null
}

function patternPrefix(pattern) {
  return pattern.endsWith("/**") ? pattern.slice(0, -3) : pattern
}

export function pathPatternsOverlap(left, right) {
  // An extension glob overlaps an exact path with that extension.
  for (const [glob, other] of [[left, right], [right, left]]) {
    const extension = extensionOf(glob)
    if (extension) return !other.endsWith("/**") && !extensionOf(other) && other.endsWith(extension)
  }
  const leftPrefix = patternPrefix(left)
  const rightPrefix = patternPrefix(right)
  if (!left.endsWith("/**") && !right.endsWith("/**")) return left === right
  if (left.endsWith("/**") && right.endsWith("/**")) {
    return (
      leftPrefix === rightPrefix ||
      leftPrefix.startsWith(`${rightPrefix}/`) ||
      rightPrefix.startsWith(`${leftPrefix}/`)
    )
  }
  const directory = left.endsWith("/**") ? leftPrefix : rightPrefix
  const candidate = left.endsWith("/**") ? right : left
  return candidate === directory || candidate.startsWith(`${directory}/`)
}

function phasesReachableFrom(phaseId, phasesById, memo = new Map()) {
  if (memo.has(phaseId)) return memo.get(phaseId)
  const reachable = new Set()
  memo.set(phaseId, reachable)
  for (const dependency of phasesById.get(phaseId)?.depends_on ?? []) {
    reachable.add(dependency)
    for (const ancestor of phasesReachableFrom(dependency, phasesById, memo)) {
      reachable.add(ancestor)
    }
  }
  return reachable
}

function executionWaves(phases, phasesById) {
  const remaining = new Set(phases.map((phase) => phase.phase_id))
  const completed = new Set()
  const waves = []
  while (remaining.size > 0) {
    const ready = phases
      .filter((phase) => remaining.has(phase.phase_id))
      .filter((phase) => phase.depends_on.every((dependency) => completed.has(dependency)))
      .map((phase) => phase.phase_id)
    if (ready.length === 0) return null
    waves.push(ready)
    for (const phaseId of ready) {
      remaining.delete(phaseId)
      completed.add(phaseId)
    }
  }
  return waves
}

export function validatePlan(plan, { workClasses = null, maxContracts = null } = {}) {
  const errors = []
  if (plan?.schema_version !== 1) errors.push("schema_version must be 1")
  for (const field of ["plan_id", "objective", "base_revision"]) {
    if (!nonEmptyString(plan?.[field])) errors.push(`${field} must be a non-empty string`)
  }
  if (plan?.final_verification !== undefined) {
    if (
      !Array.isArray(plan.final_verification?.commands) ||
      plan.final_verification.commands.some((command) => !nonEmptyString(command))
    ) {
      errors.push("final_verification.commands must be an array of commands")
    } else if (plan.final_verification.commands.some((command) => GIT_STATE_COMMAND.test(command))) {
      errors.push("final_verification.commands must not inspect Git state")
    }
  }
  if (maxContracts !== null && Array.isArray(plan?.phases)) {
    const total = plan.phases.reduce((sum, phase) => sum + (phase?.contracts?.length ?? 0), 0)
    if (total > maxContracts) {
      errors.push(`plan defines ${total} contracts but this route allows at most ${maxContracts}`)
    }
  }
  if (!Array.isArray(plan?.phases) || plan.phases.length === 0) {
    errors.push("phases must be a non-empty array")
    return { valid: false, errors, execution_waves: [] }
  }

  const phasesById = new Map()
  const contractIds = new Set()
  for (const phase of plan.phases) {
    if (!nonEmptyString(phase?.phase_id)) {
      errors.push("every phase must define phase_id")
      continue
    }
    if (phasesById.has(phase.phase_id)) errors.push(`duplicate phase_id: ${phase.phase_id}`)
    phasesById.set(phase.phase_id, phase)
  }

  for (const phase of plan.phases) {
    const phaseId = phase.phase_id ?? "unknown"
    if (!nonEmptyString(phase.objective)) errors.push(`${phaseId}: objective is required`)
    if (!Array.isArray(phase.depends_on)) errors.push(`${phaseId}: depends_on must be an array`)
    for (const dependency of phase.depends_on ?? []) {
      if (!phasesById.has(dependency)) errors.push(`${phaseId}: unknown dependency ${dependency}`)
      if (dependency === phaseId) errors.push(`${phaseId}: phase cannot depend on itself`)
    }
    if (!Array.isArray(phase.contracts) || phase.contracts.length === 0) {
      errors.push(`${phaseId}: contracts must be a non-empty array`)
      continue
    }

    for (const contract of phase.contracts) {
      const contractId = contract?.contract_id ?? "unknown"
      if (!nonEmptyString(contract?.contract_id)) errors.push(`${phaseId}: contract_id is required`)
      else if (contractIds.has(contractId)) errors.push(`duplicate contract_id: ${contractId}`)
      else contractIds.add(contractId)
      if (!nonEmptyString(contract?.objective)) errors.push(`${contractId}: objective is required`)
      if (!RISKS.has(contract?.risk)) errors.push(`${contractId}: invalid risk`)
      if (!nonEmptyString(contract?.work_class)) errors.push(`${contractId}: work_class is required`)
      else if (workClasses && !workClasses.has(contract.work_class)) {
        errors.push(`${contractId}: unknown work_class ${contract.work_class}`)
      }
      for (const field of ["read", "allowed_to_modify", "forbidden", "requirements", "response"]) {
        if (!Array.isArray(contract?.[field])) errors.push(`${contractId}: ${field} must be an array`)
      }
      if (contract?.allowed_to_modify?.length === 0) {
        errors.push(`${contractId}: allowed_to_modify cannot be empty`)
      }
      if (contract?.requirements?.length === 0) errors.push(`${contractId}: requirements cannot be empty`)
      for (const field of ["read", "allowed_to_modify", "forbidden"]) {
        const accepts = field === "allowed_to_modify" ? validPathPattern : validDescriptivePattern
        for (const pattern of contract?.[field] ?? []) {
          if (!accepts(pattern)) {
            errors.push(
              `${contractId}: unsupported path pattern in ${field}: ${pattern} (use an exact path or dir/**${field === "allowed_to_modify" ? "" : "; *.ext is also accepted here"})`,
            )
          }
        }
      }
      for (const allowed of contract?.allowed_to_modify ?? []) {
        for (const forbidden of contract?.forbidden ?? []) {
          if (pathPatternsOverlap(allowed, forbidden)) {
            errors.push(`${contractId}: allowed path overlaps forbidden path: ${allowed}`)
          }
        }
      }
      if (!Array.isArray(contract?.verification?.commands) || contract.verification.commands.length === 0) {
        errors.push(`${contractId}: verification.commands cannot be empty`)
      } else {
        for (const command of contract.verification.commands) {
          if (GIT_STATE_COMMAND.test(command)) errors.push(`${contractId}: verification.commands must not inspect Git state (${command.trim().slice(0, 40)}…): the gate reruns on the integrated branch where the change is committed; scope is enforced by the orchestrator`)
        }
      }
      if (!Array.isArray(contract?.verification?.invariants)) {
        errors.push(`${contractId}: verification.invariants must be an array`)
      }
      if (
        contract?.verification?.expected_baseline !== undefined &&
        !["fail", "pass"].includes(contract.verification.expected_baseline)
      ) {
        errors.push(`${contractId}: verification.expected_baseline must be fail or pass`)
      }
      if (!Number.isInteger(contract?.budgets?.max_builder_attempts) || contract.budgets.max_builder_attempts < 1) {
        errors.push(`${contractId}: max_builder_attempts must be at least 1`)
      }
      if (!Number.isInteger(contract?.budgets?.max_contract_revisions) || contract.budgets.max_contract_revisions < 0) {
        errors.push(`${contractId}: max_contract_revisions must be non-negative`)
      }
      if (contract?.budgets?.max_unplanned_scope_expansion !== 0) {
        errors.push(`${contractId}: max_unplanned_scope_expansion must be 0`)
      }
    }
  }

  const waves = executionWaves(plan.phases, phasesById)
  if (!waves) errors.push("phase dependency graph contains a cycle")

  const reachability = new Map()
  for (const phase of plan.phases) phasesReachableFrom(phase.phase_id, phasesById, reachability)
  for (let leftIndex = 0; leftIndex < plan.phases.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < plan.phases.length; rightIndex += 1) {
      const left = plan.phases[leftIndex]
      const right = plan.phases[rightIndex]
      const ordered =
        reachability.get(left.phase_id)?.has(right.phase_id) ||
        reachability.get(right.phase_id)?.has(left.phase_id)
      if (ordered) continue
      for (const leftContract of left.contracts ?? []) {
        for (const rightContract of right.contracts ?? []) {
          for (const leftPath of leftContract.allowed_to_modify ?? []) {
            for (const rightPath of rightContract.allowed_to_modify ?? []) {
              if (pathPatternsOverlap(leftPath, rightPath)) {
                errors.push(
                  `parallel contracts ${leftContract.contract_id} and ${rightContract.contract_id} overlap at ${leftPath} / ${rightPath}`,
                )
              }
            }
          }
        }
      }
    }
  }

  for (const phase of plan.phases) {
    const contracts = phase.contracts ?? []
    for (let leftIndex = 0; leftIndex < contracts.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < contracts.length; rightIndex += 1) {
        for (const leftPath of contracts[leftIndex].allowed_to_modify ?? []) {
          for (const rightPath of contracts[rightIndex].allowed_to_modify ?? []) {
            if (pathPatternsOverlap(leftPath, rightPath)) {
              errors.push(
                `parallel contracts ${contracts[leftIndex].contract_id} and ${contracts[rightIndex].contract_id} overlap at ${leftPath} / ${rightPath}`,
              )
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, execution_waves: waves ?? [] }
}
