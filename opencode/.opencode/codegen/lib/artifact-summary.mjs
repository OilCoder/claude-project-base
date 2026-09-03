// Plain-language summaries of what an agent produced, computed from the files
// it wrote (never from what the model says). Pure: the caller reads the files.

export const AGENT_PURPOSE = {
  "goal-manager": "redacta el Goal a partir de tu intención",
  planner: "convierte el Goal aprobado en un plan de contratos sellados",
  "gate-designer": "prepara la verificación: debe fallar antes del cambio y pasar después",
  builder: "implementa un contrato sellado y corre su Gate",
  researcher: "responde una pregunta de investigación con fuentes reales",
  advisor: "da una opinión independiente sobre una decisión abierta",
  reconciler: "concilia opiniones divergentes en una decisión propuesta",
  supervisor: "conduce la conversación sin escribir código",
}

const STATUS_ES = {
  DRAFT: "borrador, pendiente de tu aprobación",
  RESEARCHING: "en investigación",
  DECIDED: "decidido, pendiente de tu aprobación",
  SEALED: "sellado y aprobado",
  COMPLETE: "completo",
  BLOCKED: "bloqueado",
  PROPOSED: "propuesta, pendiente de que el Goal la registre",
}

const SHAPE_ES = { localized: "cambio localizado", "multi-component": "varios componentes", system: "cambio de sistema" }
const RISK_ES = { low: "riesgo bajo", medium: "riesgo medio", high: "riesgo alto" }

function count(items, singular, plural = `${singular}s`) {
  const n = Array.isArray(items) ? items.length : 0
  return `${n} ${n === 1 ? singular : plural}`
}

function parseJson(content) {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

function summarizeGoal(goal) {
  const musts = (goal.requirements ?? []).filter((r) => r.priority === "must").length
  const pending = (goal.research_questions ?? []).filter((q) => q.status === "pending").length
  const blocking = (goal.open_questions ?? []).filter((q) => q.blocking).length
  const routing = goal.routing ?? {}
  return [
    `Redactó el Goal «${goal.title ?? goal.goal_id}» (${goal.goal_id}), ${STATUS_ES[goal.status] ?? goal.status}.`,
    `Fijó ${count(goal.requirements, "requisito")} (${musts} obligatorios), ${count(goal.constraints, "restricción", "restricciones")} y ${count(goal.acceptance_criteria, "criterio de aceptación", "criterios de aceptación")}.`,
    `Ruta: ${SHAPE_ES[routing.change_shape] ?? routing.change_shape}, ${RISK_ES[routing.risk] ?? routing.risk}, ${routing.existing_gate ? "con Gate existente" : "sin Gate existente (habrá que prepararlo)"}.`,
    `Pendientes: ${pending} investigaciones, ${blocking} preguntas bloqueantes · presupuesto: ${goal.budgets?.max_planner_calls ?? "?"} llamada(s) al Planner.`,
  ]
}

function summarizePlan(plan) {
  const phases = plan.phases ?? []
  const contracts = phases.flatMap((phase) => phase.contracts ?? [])
  const lines = [`Planificó «${plan.objective ?? plan.plan_id}» en ${count(phases, "fase")} y ${count(contracts, "contrato")} sobre la revisión ${String(plan.base_revision ?? "").slice(0, 7)}.`]
  for (const phase of phases) {
    const deps = (phase.depends_on ?? []).length ? ` (después de ${phase.depends_on.join(", ")})` : ""
    lines.push(`Fase ${phase.phase_id}${deps}: ${phase.objective ?? ""}`)
    for (const contract of phase.contracts ?? []) {
      lines.push(`  · ${contract.contract_id}: ${contract.objective} → ${(contract.allowed_to_modify ?? []).join(", ")} · Gate: ${(contract.verification?.commands ?? []).join("; ")}`)
    }
  }
  return lines
}

function summarizeContract(contract) {
  return [
    `Selló el contrato ${contract.contract_id}: ${contract.objective}`,
    `Puede modificar ${(contract.allowed_to_modify ?? []).join(", ")} · Gate: ${(contract.verification?.commands ?? []).join("; ")}`,
  ]
}

function summarizeResearch(report) {
  const lines = [`Investigó «${report.question}»: informe ${STATUS_ES[report.status] ?? report.status} con ${count(report.findings, "hallazgo")} y ${count(report.sources, "fuente")}.`]
  for (const finding of (report.findings ?? []).slice(0, 4)) lines.push(`  · [${finding.confidence}] ${finding.claim}`)
  if (report.recommendation) lines.push(`Recomienda: ${report.recommendation}`)
  for (const q of report.unanswered_questions ?? []) lines.push(`  Sin responder: ${q}`)
  return lines
}

function summarizeOpinion(opinion) {
  const position = opinion.position === "OTHER" ? `OTRA: ${opinion.alternative}` : opinion.position
  return [`Opinó «${position}» (confianza ${opinion.confidence}) sobre «${opinion.question}»: ${opinion.rationale}`, ...(opinion.risks ?? []).slice(0, 3).map((r) => `  Riesgo: ${r}`)]
}

function summarizeDecision(decision) {
  return [
    `Propuso la decisión «${decision.chosen}» (${decision.method}) sobre «${decision.question}»: ${decision.rationale}`,
    ...(decision.rejected ?? []).map((r) => `  Descartó «${r.position}»: ${r.why_rejected}`),
  ]
}

function summarizeGate(files) {
  const gate = files.find((file) => /gate\.sh$/.test(file.path))
  const checks = files.filter((file) => !/gate\.sh$/.test(file.path))
  const lines = []
  if (gate) {
    const commands = gate.content.split("\n").filter((row) => row.trim() && !row.startsWith("#") && !/^set /.test(row))
    lines.push(`Preparó el Gate ${gate.path}: ${commands.join(" · ") || "(vacío)"}`)
  }
  if (checks.length) lines.push(`Escribió ${count(checks, "check")}: ${checks.map((file) => file.path).join(", ")}`)
  return lines
}

// files: [{ path (relative), content }] written by the agent. Returns lines
// describing the outcome in the agent's role, or [] when nothing is known.
export function summarizeWrittenFiles(files, { agent = null, gate = null } = {}) {
  const lines = []
  const product = []
  const gateFiles = []
  for (const file of files) {
    const json = file.path.endsWith(".json") ? parseJson(file.content) : null
    if (/^\.codegen-goal\/.*\.json$/.test(file.path) && json?.goal_id) lines.push(...summarizeGoal(json))
    else if (/^\.codegen-plan\/.*\.json$/.test(file.path) && json?.plan_id) lines.push(...summarizePlan(json))
    else if (/^\.codegen-contract\/contract\.json$/.test(file.path) && json?.contract_id) lines.push(...summarizeContract(json))
    else if (/^\.codegen-research\/.*\.json$/.test(file.path) && json?.report_id) lines.push(...summarizeResearch(json))
    else if (/^\.codegen-opinions\/.*decision\.json$/.test(file.path) && json?.decision_id) lines.push(...summarizeDecision(json))
    else if (/^\.codegen-opinions\/.*\.json$/.test(file.path) && json?.opinion_id) lines.push(...summarizeOpinion(json))
    else if (file.path.startsWith(".codegen-contract/")) gateFiles.push(file)
    else product.push(file)
  }
  if (gateFiles.length) lines.push(...summarizeGate(gateFiles))
  if (product.length) {
    const described = product.map((file) => `${file.path} (${file.content.split("\n").length} líneas)`)
    lines.push(`${agent === "builder" ? "Implementó el contrato escribiendo" : "Escribió"} ${described.join(", ")}.`)
    if (gate) lines.push(gate.passed ? "El Gate propio pasó; el orquestador lo volverá a correr por su cuenta." : `El Gate propio falló${gate.detail ? `: ${gate.detail}` : ""}.`)
  }
  return lines
}

// One line per step, from the actions the step contained.
export function describeStep(actions) {
  if (actions.length === 0) return "informó sin usar herramientas"
  const parts = []
  const reads = actions.filter((a) => a.verb === "Leyó")
  const others = actions.filter((a) => a.verb !== "Leyó")
  if (reads.length) {
    const names = reads.flatMap((a) => a.files ?? [a.object])
    parts.push(`leyó ${names.length === 1 ? names[0] : `${names.length} archivos (${names.slice(0, 3).join(", ")}${names.length > 3 ? ", …" : ""})`}`)
  }
  for (const action of others) {
    const verb = action.verb.charAt(0).toLowerCase() + action.verb.slice(1)
    const result = action.result ? ` (${action.result})` : ""
    parts.push(`${action.failed ? "falló al " : ""}${action.failed ? verb.replace(/ó$/, "ar") : verb} ${action.object}${result}`)
  }
  return parts.join(", ")
}
