import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { AGENT_PURPOSE, describeStep, summarizeWrittenFiles } from "../.opencode/codegen/lib/artifact-summary.mjs"
import { createRenderer, renderHeader, stripAnsi } from "../.opencode/codegen/lib/display.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))

test("a written Goal is summarized in the Goal Manager's terms", async () => {
  const content = await readFile(path.join(here, "fixtures/goal-research/goal.json"), "utf8")
  const lines = summarizeWrittenFiles([{ path: ".codegen-goal/goal.json", content }], { agent: "goal-manager" })
  assert.match(lines[0], /^Redactó el Goal «Reject duplicate user emails» \(email-uniqueness\), borrador, pendiente de tu aprobación\./)
  assert.match(lines[1], /1 requisito \(1 obligatorios\), 1 restricción y 1 criterio de aceptación/)
  assert.match(lines[2], /cambio localizado, riesgo bajo, con Gate existente/)
  assert.match(lines[3], /1 investigaciones, 0 preguntas bloqueantes · presupuesto: 1 llamada/)
})

test("a written plan lists phases and contracts; product files describe the Builder's work", async () => {
  const content = await readFile(path.join(here, "fixtures/orchestrator-basic/plan-template.json"), "utf8")
  const lines = summarizeWrittenFiles([{ path: ".codegen-plan/r1.json", content }], { agent: "planner" })
  assert.match(lines[0], /^Planificó «Implement alpha, beta, and gamma so that the unit tests pass\.» en 2 fases y 3 contratos/)
  assert.ok(lines.some((line) => line.startsWith("Fase compose (después de core)")))
  assert.ok(lines.some((line) => line.includes("· alpha: Implement alpha → lib/alpha.py · Gate: python3 -m unittest tests/test_alpha.py")))

  const built = summarizeWrittenFiles([{ path: "scripts/count-las.sh", content: "#!/bin/bash\nfind data -name '*.las' | wc -l\n" }], { agent: "builder", gate: { passed: true } })
  assert.equal(built[0], "Implementó el contrato escribiendo scripts/count-las.sh (3 líneas).")
  assert.match(built[1], /^El Gate propio pasó/)
  const gate = summarizeWrittenFiles([
    { path: ".codegen-contract/gate.sh", content: "#!/usr/bin/env bash\nset -euo pipefail\npython3 -m unittest .codegen-contract/checks/test_alpha.py\n" },
    { path: ".codegen-contract/checks/test_alpha.py", content: "import unittest\n" },
  ], { agent: "gate-designer" })
  assert.equal(gate[0], "Preparó el Gate .codegen-contract/gate.sh: python3 -m unittest .codegen-contract/checks/test_alpha.py")
  assert.equal(gate[1], "Escribió 1 check: .codegen-contract/checks/test_alpha.py")
  assert.deepEqual(summarizeWrittenFiles([{ path: "x.json", content: "not json" }]), ["Escribió x.json (1 líneas)."])
})

test("each step is described from its actions and the digest leads with the outcome", () => {
  assert.equal(describeStep([]), "informó sin usar herramientas")
  assert.equal(describeStep([{ verb: "Leyó", object: "2 archivos", files: ["a.py", "b.py"] }, { verb: "Escribió", object: "a.py", result: "+3" }]), "leyó 2 archivos (a.py, b.py), escribió a.py (+3)")
  assert.equal(describeStep([{ verb: "Ejecutó", object: "gate.sh", result: "salida 1", failed: true }]), "falló al ejecutar gate.sh (salida 1)")

  const renderer = createRenderer({ directory: "/p", width: 90 })
  renderer.feed(JSON.stringify({ type: "step_start" }))
  renderer.feed(JSON.stringify({ type: "tool_use", part: { tool: "read", state: { status: "completed", input: { filePath: "/p/schema.json" } } } }))
  renderer.feed(JSON.stringify({ type: "step_finish", part: { cost: 0 } }))
  renderer.feed(JSON.stringify({ type: "step_start" }))
  renderer.feed(JSON.stringify({ type: "tool_use", part: { tool: "write", state: { status: "completed", input: { filePath: "/p/.codegen-goal/goal.json", content: "{}" } } } }))
  renderer.feed(JSON.stringify({ type: "step_finish", part: { cost: 0 } }))
  assert.deepEqual(renderer.state.written, [".codegen-goal/goal.json"])
  const digest = renderer.finish({ outcome: ["Redactó el Goal «X» (x), borrador."] }).map(stripAnsi)
  assert.equal(digest[1], "Resultado")
  assert.equal(digest[2], "  Redactó el Goal «X» (x), borrador.")
  assert.ok(digest.includes("Qué hizo en cada paso"))
  assert.ok(digest.some((line) => /^ 1 ✔ leyó schema\.json$/.test(line)), digest.join("\n"))
  assert.ok(digest.some((line) => /^ 2 ✔ escribió \.codegen-goal\/goal\.json \(1 líneas\)$/.test(line)), digest.join("\n"))
  const header = renderHeader({ title: "goal-manager · goal.json", agent: "goal-manager", model: "m" }).map(stripAnsi)
  assert.ok(header[2].includes(`hace     ${AGENT_PURPOSE["goal-manager"]}`), header[2])
})
