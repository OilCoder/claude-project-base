const CONFIDENCE = new Set(["low", "medium", "high"])
export const OTHER = "OTHER"

function text(value) {
  return typeof value === "string" && value.trim().length > 0
}

function stringList(value, label, errors) {
  if (!Array.isArray(value)) errors.push(`${label} must be an array`)
  else if (value.some((item) => !text(item))) errors.push(`${label} contains empty text`)
}

export function validateOpinion(opinion, question = null) {
  const errors = []
  if (opinion?.schema_version !== 1) errors.push("schema_version must be 1")
  for (const field of ["opinion_id", "question_id", "question", "position", "rationale"]) {
    if (!text(opinion?.[field])) errors.push(`${field} must be a non-empty string`)
  }
  if (!Array.isArray(opinion?.options) || opinion.options.length < 2) {
    errors.push("options must list at least two choices")
  }
  stringList(opinion?.evidence, "evidence", errors)
  stringList(opinion?.risks, "risks", errors)
  if (!CONFIDENCE.has(opinion?.confidence)) errors.push("confidence is invalid")
  const options = Array.isArray(opinion?.options) ? opinion.options : []
  if (text(opinion?.position) && opinion.position !== OTHER && !options.includes(opinion.position)) {
    errors.push(`position must be one of the options or ${OTHER}`)
  }
  if (opinion?.position === OTHER && !text(opinion?.alternative)) {
    errors.push(`position ${OTHER} requires an alternative`)
  }
  if (question) {
    if (opinion?.question_id !== question.id) errors.push("question_id does not match Goal")
    if (opinion?.question !== question.question) errors.push("question text does not match Goal")
    const expected = JSON.stringify(question.options ?? [])
    if (JSON.stringify(options) !== expected) errors.push("options do not match Goal question")
  }
  return { valid: errors.length === 0, errors }
}

// Deterministic reconciliation. Opinions must come from distinct model
// families, otherwise they are not independent. Unanimity on a listed option
// yields a decision without another model call; anything else needs the
// Reconciler.
export function reconcileOpinions(opinions, { minOpinions = 2 } = {}) {
  const families = new Map()
  for (const { opinion, family } of opinions) {
    if (families.has(family)) {
      return {
        status: "INSUFFICIENT_INDEPENDENCE",
        reason: `family ${family} produced more than one opinion (${families.get(family)}, ${opinion.opinion_id})`,
      }
    }
    families.set(family, opinion.opinion_id)
  }
  if (opinions.length < minOpinions) {
    return { status: "INSUFFICIENT_OPINIONS", reason: `${opinions.length} of ${minOpinions} required opinions` }
  }
  const positions = new Map()
  for (const { opinion } of opinions) {
    const key = opinion.position
    if (!positions.has(key)) positions.set(key, [])
    positions.get(key).push(opinion.opinion_id)
  }
  const tally = [...positions.entries()].map(([position, ids]) => ({ position, opinion_ids: ids }))
  if (positions.size === 1 && !positions.has(OTHER)) {
    return { status: "UNANIMOUS", chosen: tally[0].position, tally }
  }
  return {
    status: "DIVERGENT",
    tally,
    reason: positions.has(OTHER) ? "an advisor rejected every listed option" : "advisors disagree",
  }
}

export function validateDecision(decision, { question = null, opinions = [] } = {}) {
  const errors = []
  if (decision?.schema_version !== 1) errors.push("schema_version must be 1")
  for (const field of ["decision_id", "question_id", "question", "chosen", "rationale"]) {
    if (!text(decision?.[field])) errors.push(`${field} must be a non-empty string`)
  }
  if (decision?.status !== "PROPOSED") errors.push("status must be PROPOSED")
  if (!["unanimous", "reconciled"].includes(decision?.method)) errors.push("method is invalid")
  if (!Array.isArray(decision?.opinion_ids) || decision.opinion_ids.length === 0) {
    errors.push("opinion_ids cannot be empty")
  }
  if (!Array.isArray(decision?.rejected)) errors.push("rejected must be an array")
  for (const item of decision?.rejected ?? []) {
    if (!text(item?.position) || !text(item?.why_rejected) || !Array.isArray(item?.opinion_ids) || item.opinion_ids.length === 0) {
      errors.push("every rejected position needs position, opinion_ids, and why_rejected")
    }
  }
  if (decision?.residual_risks !== undefined) stringList(decision.residual_risks, "residual_risks", errors)
  if (question) {
    if (decision?.question_id !== question.id) errors.push("question_id does not match Goal")
    if (decision?.question !== question.question) errors.push("question text does not match Goal")
  }
  if (opinions.length > 0) {
    const ids = new Set(opinions.map((opinion) => opinion.opinion_id))
    for (const id of decision?.opinion_ids ?? []) {
      if (!ids.has(id)) errors.push(`unknown opinion ${id}`)
    }
    for (const id of ids) {
      if (!(decision?.opinion_ids ?? []).includes(id)) errors.push(`decision does not cite opinion ${id}`)
    }
    const losing = new Set(
      opinions
        .map((opinion) => (opinion.position === OTHER ? `${OTHER}:${opinion.alternative}` : opinion.position))
        .filter((position) => position !== decision?.chosen),
    )
    const explained = new Set((decision?.rejected ?? []).map((item) => item.position))
    for (const position of losing) {
      if (!explained.has(position)) errors.push(`rejected position not explained: ${position}`)
    }
    const listedOptions = opinions[0].options ?? []
    const proposed = opinions.filter((opinion) => opinion.position === OTHER).map((opinion) => `${OTHER}:${opinion.alternative}`)
    if (text(decision?.chosen) && !listedOptions.includes(decision.chosen) && !proposed.includes(decision.chosen)) {
      errors.push("chosen must be a listed option or an advisor's OTHER alternative")
    }
  }
  return { valid: errors.length === 0, errors }
}

export function unanimousDecision({ question, opinions, decisionId }) {
  return {
    schema_version: 1,
    decision_id: decisionId,
    question_id: question.id,
    question: question.question,
    status: "PROPOSED",
    method: "unanimous",
    chosen: opinions[0].position,
    rationale: `All ${opinions.length} independent advisors chose "${opinions[0].position}": ${opinions.map((opinion) => `${opinion.opinion_id}: ${opinion.rationale}`).join(" | ")}`,
    opinion_ids: opinions.map((opinion) => opinion.opinion_id),
    rejected: [],
    residual_risks: [...new Set(opinions.flatMap((opinion) => opinion.risks))],
  }
}

function bullets(items, format = (item) => item) {
  return items.length > 0 ? items.map((item) => `- ${format(item)}`).join("\n") : "- None"
}

export function renderDecisionMarkdown(decision, opinions = []) {
  return `# Decision: ${decision.question}

**Decision ID:** \`${decision.decision_id}\`<br>
**Question ID:** \`${decision.question_id}\`<br>
**Status:** \`${decision.status}\` (${decision.method})

## Chosen

${decision.chosen}

## Rationale

${decision.rationale}

## Opinions

${bullets(opinions, (opinion) => `\`${opinion.opinion_id}\` [${opinion.confidence}] ${opinion.position}${opinion.position === OTHER ? ` (${opinion.alternative})` : ""}: ${opinion.rationale}`)}

## Rejected Positions

${bullets(decision.rejected, (item) => `${item.position} (${item.opinion_ids.join(", ")}): ${item.why_rejected}`)}

## Residual Risks

${bullets(decision.residual_risks ?? [])}
`
}
