import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { bar, createRenderer, renderHeader, stripAnsi } from "../.opencode/codegen/lib/display.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))

test("header shows model, roles, window, and extra lines", () => {
  const lines = renderHeader({
    title: "planner · .codegen-plan/r7.json",
    roles: ["Planner / Engineer", "Redactor del contrato"],
    run_id: "r7",
    attempt: 1,
    model: "opencode-go/glm-5.3",
    context_tokens: 200000,
    lines: ["objetivo  Implement alpha"],
  }).map(stripAnsi)
  assert.ok(lines[1].includes("planner · .codegen-plan/r7.json   run r7 · intento 1"))
  assert.ok(lines[2].includes("opencode-go/glm-5.3"))
  assert.ok(lines[3].includes("Planner / Engineer · Redactor del contrato"))
  assert.ok(lines[4].includes("200.000 tokens"))
  assert.ok(lines[5].includes("objetivo  Implement alpha"))
  assert.ok(lines[0].startsWith("┌") && lines.at(-1).startsWith("└"))
})

test("real opencode events render as readable tool, text, and usage lines", async () => {
  const events = await readFile(path.join(here, "fixtures/opencode-events.jsonl"), "utf8")
  const renderer = createRenderer({ directory: "/home/user/project", contextTokens: 204800 })
  const lines = events.split("\n").flatMap((line) => renderer.feed(line)).map(stripAnsi)
  assert.ok(lines.includes("── paso 1 ──"))
  assert.ok(lines.some((line) => /^read {5}note\.txt {2}\d+ ms$/.test(line)), lines.join("\n"))
  assert.ok(lines.some((line) => /^bash {5}echo done {2}\d+ ms$/.test(line)))
  assert.ok(lines.some((line) => line.startsWith("▎ The note.txt file contains")))
  const usage = lines.filter((line) => line.startsWith("uso"))
  assert.equal(usage.length, 2)
  assert.ok(usage[1].includes("7.962 / 204.800"))
  assert.ok(usage[1].includes("caché 7.708"))
  assert.equal(renderer.state.steps, 2)
  assert.equal(renderer.state.tools, 2)
  assert.ok(Math.abs(renderer.state.cost - 0.00085992) < 1e-9)
})

test("errors and failed commands are surfaced; the bar scales to the window", () => {
  const renderer = createRenderer({ contextTokens: 100 })
  const error = renderer.feed(JSON.stringify({ type: "error", error: { name: "APIError", data: { statusCode: 402, message: "Go usage limit reached" } } }))
  assert.equal(stripAnsi(error[0]), "ERROR APIError 402 Go usage limit reached")
  const failed = renderer.feed(JSON.stringify({ type: "tool_use", part: { tool: "bash", state: { status: "completed", input: { command: "false" }, metadata: { exit: 1 } } } }))
  assert.ok(stripAnsi(failed[0]).includes("exit 1"))
  assert.equal(bar(50, 100, 10), "▇▇▇▇▇▁▁▁▁▁")
  assert.equal(bar(10, 0, 4), "····")
  assert.equal(stripAnsi(renderer.feed("not json")[0]), "not json")
})
