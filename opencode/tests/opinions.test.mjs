import assert from "node:assert/strict"
import test from "node:test"

import {
  reconcileOpinions,
  renderDecisionMarkdown,
  unanimousDecision,
  validateDecision,
  validateOpinion,
} from "../.opencode/codegen/lib/opinions.mjs"

const question = {
  id: "OQ-1",
  question: "Application check or database constraint?",
  blocking: true,
  options: ["application-check", "database-constraint"],
}

function opinion(id, position, extra = {}) {
  return {
    schema_version: 1,
    opinion_id: id,
    question_id: "OQ-1",
    question: question.question,
    options: [...question.options],
    position,
    rationale: `${id} prefers ${position}`,
    evidence: ["src/users/service.ts"],
    risks: [`${id} risk`],
    confidence: "medium",
    ...extra,
  }
}

test("opinion validation binds to the Goal question and closed options", () => {
  assert.deepEqual(validateOpinion(opinion("a", "database-constraint"), question), { valid: true, errors: [] })
  const cases = [
    [opinion("a", "cache-layer"), "position must be one of the options or OTHER"],
    [opinion("a", "OTHER"), "position OTHER requires an alternative"],
    [opinion("a", "database-constraint", { confidence: "sure" }), "confidence is invalid"],
    [opinion("a", "database-constraint", { question_id: "OQ-9" }), "question_id does not match Goal"],
    [opinion("a", "database-constraint", { options: ["x", "y"] }), "options do not match Goal question"],
  ]
  for (const [candidate, expected] of cases) {
    const result = validateOpinion(candidate, question)
    assert.ok(result.errors.includes(expected), `expected "${expected}" in ${result.errors}`)
  }
})

test("reconciliation: unanimous, divergent, OTHER, same family, too few", () => {
  const a = opinion("a", "database-constraint")
  const b = opinion("b", "database-constraint")
  const unanimous = reconcileOpinions([{ opinion: a, family: "claude" }, { opinion: b, family: "kimi" }])
  assert.equal(unanimous.status, "UNANIMOUS")
  assert.equal(unanimous.chosen, "database-constraint")

  const divergent = reconcileOpinions([{ opinion: a, family: "claude" }, { opinion: opinion("b", "application-check"), family: "kimi" }])
  assert.equal(divergent.status, "DIVERGENT")
  assert.deepEqual(divergent.tally.map((entry) => entry.position), ["database-constraint", "application-check"])

  const other = reconcileOpinions([
    { opinion: opinion("a", "OTHER", { alternative: "unique index plus retry" }), family: "claude" },
    { opinion: opinion("b", "OTHER", { alternative: "unique index plus retry" }), family: "kimi" },
  ])
  assert.equal(other.status, "DIVERGENT")
  assert.match(other.reason, /rejected every listed option/)

  const sameFamily = reconcileOpinions([{ opinion: a, family: "claude" }, { opinion: b, family: "claude" }])
  assert.equal(sameFamily.status, "INSUFFICIENT_INDEPENDENCE")
  assert.equal(reconcileOpinions([{ opinion: a, family: "claude" }]).status, "INSUFFICIENT_OPINIONS")
})

test("decision validation requires citing every opinion and explaining every losing position", () => {
  const a = opinion("a", "database-constraint")
  const b = opinion("b", "application-check")
  const c = opinion("c", "OTHER", { alternative: "unique index plus retry" })
  const decision = {
    schema_version: 1,
    decision_id: "DEC-OQ-1",
    question_id: "OQ-1",
    question: question.question,
    status: "PROPOSED",
    method: "reconciled",
    chosen: "database-constraint",
    rationale: "Race-free and simplest",
    opinion_ids: ["a", "b", "c"],
    rejected: [
      { position: "application-check", opinion_ids: ["b"], why_rejected: "race condition" },
      { position: "OTHER:unique index plus retry", opinion_ids: ["c"], why_rejected: "retry hides the domain error" },
    ],
  }
  assert.deepEqual(validateDecision(decision, { question, opinions: [a, b, c] }), { valid: true, errors: [] })
  const missingCite = validateDecision({ ...decision, opinion_ids: ["a", "b"] }, { question, opinions: [a, b, c] })
  assert.ok(missingCite.errors.includes("decision does not cite opinion c"))
  const unexplained = validateDecision({ ...decision, rejected: decision.rejected.slice(0, 1) }, { question, opinions: [a, b, c] })
  assert.ok(unexplained.errors.includes("rejected position not explained: OTHER:unique index plus retry"))
  const invented = validateDecision({ ...decision, chosen: "cache-layer" }, { question, opinions: [a, b, c] })
  assert.ok(invented.errors.includes("chosen must be a listed option or an advisor's OTHER alternative"))
  assert.ok(validateDecision({ ...decision, status: "FINAL" }).errors.includes("status must be PROPOSED"))
})

test("unanimous decision is a valid proposal that renders without undefined", () => {
  const opinions = [opinion("a", "database-constraint"), opinion("b", "database-constraint")]
  const decision = unanimousDecision({ question, opinions, decisionId: "DEC-OQ-1" })
  assert.deepEqual(validateDecision(decision, { question, opinions }), { valid: true, errors: [] })
  const markdown = renderDecisionMarkdown(decision, opinions)
  assert.ok(markdown.includes("## Chosen\n\ndatabase-constraint"))
  assert.ok(markdown.includes("`a` [medium] database-constraint"))
  assert.ok(!markdown.includes("undefined"))
})
