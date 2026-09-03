import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { bar, compact, createRenderer, diffStats, patchFiles, renderHeader, stripAnsi, wrap } from "../.opencode/codegen/lib/display.mjs"

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

test("real opencode events render as a guided transcript with a closing digest", async () => {
  const events = await readFile(path.join(here, "fixtures/opencode-events.jsonl"), "utf8")
  let clock = 0
  const renderer = createRenderer({ directory: "/home/user/project", contextTokens: 204800, now: () => (clock += 1500) })
  const lines = events.split("\n").flatMap((line) => renderer.feed(line)).map(stripAnsi)
  assert.ok(lines.some((line) => /^✔ Leyó note\.txt\s+\+\d+ s$/.test(line)), lines.join("\n"))
  assert.ok(lines.some((line) => /^✔ Ejecutó echo done  salida 0\s+\+\d+ s$/.test(line)), lines.join("\n"))
  assert.ok(lines.some((line) => line.startsWith("┃ The note.txt file contains")), "narration is quoted")
  assert.ok(!lines.some((line) => line.includes("· paso")), "no per-step telemetry without detail")
  const digest = renderer.finish().map(stripAnsi)
  assert.ok(digest.includes("Qué hizo en cada paso"))
  assert.ok(digest.some((line) => /^ 1 ✔ leyó note\.txt, ejecutó echo done \(salida 0\)$/.test(line)), digest.join("\n"))
  assert.ok(digest.some((line) => /^ 2 ✔ informó sin usar herramientas$/.test(line)), digest.join("\n"))
  assert.ok(digest.includes("Informe del agente"))
  assert.ok(digest.some((line) => line.startsWith("┃ The note.txt file contains")))
  assert.ok(digest.at(-1).includes("2 pasos · 2 acciones") && digest.at(-1).includes("ventana 4 %"), digest.at(-1))
  assert.equal(renderer.state.steps, 2)
  assert.equal(renderer.state.tools, 2)
  assert.ok(Math.abs(renderer.state.cost - 0.00085992) < 1e-9)
  const detailed = createRenderer({ directory: "/home/user/project", contextTokens: 204800, detail: true })
  const detailLines = events.split("\n").flatMap((line) => detailed.feed(line)).map(stripAnsi)
  assert.ok(detailLines.some((line) => line.includes("caché 7.708")))
  assert.ok(detailLines.some((line) => line.includes("herramienta bash")))
})

test("consecutive reads group into one line and narration folds to two lines", () => {
  const renderer = createRenderer({ directory: "/p", width: 80 })
  const read = (file) => JSON.stringify({ type: "tool_use", part: { tool: "read", state: { status: "completed", input: { filePath: `/p/${file}` } } } })
  assert.deepEqual(renderer.feed(read("a.js")), [])
  assert.deepEqual(renderer.feed(read("b.js")), [])
  const long = renderer.feed(JSON.stringify({ type: "text", part: { text: "palabra ".repeat(60) } })).map(stripAnsi)
  assert.ok(/^✔ Leyó 2 archivos a\.js, b\.js\s+\+0 s$/.test(long[0]), long[0])
  const quoted = long.slice(1)
  assert.equal(quoted.length, 2, "folded to two lines")
  assert.ok(quoted[1].endsWith(" …"))
  assert.equal(renderer.state.narrations, 1)
})

test("errors and failed commands are surfaced with their cause", () => {
  const renderer = createRenderer({ contextTokens: 100 })
  const error = renderer.feed(JSON.stringify({ type: "error", error: { name: "APIError", data: { statusCode: 402, message: "Go usage limit reached" } } }))
  assert.equal(stripAnsi(error[0]), "ERROR APIError 402 Go usage limit reached")
  const failed = renderer.feed(JSON.stringify({ type: "tool_use", part: { tool: "bash", state: { status: "completed", input: { command: "false" }, metadata: { exit: 1, output: "line one\nno such file" } } } })).map(stripAnsi)
  assert.ok(failed[0].startsWith("✘ Ejecutó false  salida 1"), failed[0])
  assert.ok(failed.some((line) => line.includes("no such file")), "failed commands show their output")
  assert.deepEqual(wrap("one two three four", 9), ["one two", "three", "four"])
  assert.equal(compact(9919), "9.9k")
  assert.equal(compact(1000000), "1.0M")
  assert.equal(bar(50, 100, 10), "▇▇▇▇▇▁▁▁▁▁")
  assert.equal(bar(10, 0, 4), "····")
  assert.equal(stripAnsi(renderer.feed("not json")[0]), "not json")
})

test("written content is previewed with diff stats: apply_patch names its files, edit counts +/−", () => {
  const patchText = ["*** Begin Patch", "*** Add File: /p/.codegen-goal/goal.json", ...Array.from({ length: 6 }, (_, i) => `+line ${i}`), "*** End Patch"].join("\n")
  assert.deepEqual(patchFiles(patchText), ["/p/.codegen-goal/goal.json"])
  assert.deepEqual(diffStats("--- a\n+++ b\n+x\n+y\n-z\n context"), { added: 2, removed: 1 })
  const renderer = createRenderer({ directory: "/p", previewLines: 4 })
  const lines = renderer.feed(JSON.stringify({ type: "tool_use", part: { tool: "apply_patch", state: { status: "completed", input: { patchText } } } })).map(stripAnsi)
  assert.ok(lines[0].startsWith("✔ Escribió .codegen-goal/goal.json  +6"), lines[0])
  assert.equal(lines[1], "    *** Add File: .codegen-goal/goal.json")
  assert.equal(lines[2], "    +line 0")
  assert.ok(lines.at(-1).startsWith("    … 3 líneas más · v muestra todo"), lines.at(-1))
  const full = renderer.expandLast().map(stripAnsi)
  assert.ok(full[1].startsWith("Contenido completo · .codegen-goal/goal.json"))
  assert.equal(full.filter((line) => /^ {4}\+line \d$/.test(line)).length, 6, "expandLast shows every line")
  const write = renderer.feed(JSON.stringify({ type: "tool_use", part: { tool: "write", state: { status: "completed", input: { filePath: "/p/scripts/count-las.sh", content: "#!/bin/bash\nfind data -name '*.las' | wc -l" } } } })).map(stripAnsi)
  assert.ok(write[0].startsWith("✔ Escribió scripts/count-las.sh  2 líneas"), write[0])
  assert.equal(write[2], "    find data -name '*.las' | wc -l")
  const indented = renderer.feed(JSON.stringify({ type: "tool_use", part: { tool: "write", state: { status: "completed", input: { filePath: "/p/x.json", content: "{\n  \"a\": 1\n}" } } } })).map(stripAnsi)
  assert.equal(indented[2], '      "a": 1', "preview keeps indentation")
  const edit = renderer.feed(JSON.stringify({ type: "tool_use", part: { tool: "edit", state: { status: "completed", input: { filePath: "/p/a.py", oldString: "x", newString: "y" }, metadata: { diff: "--- a\n+++ b\n-x\n+y" } } } })).map(stripAnsi)
  assert.ok(edit[0].startsWith("✔ Editó a.py  +1 −1"), edit[0])
  const quiet = createRenderer({ directory: "/p", previewLines: 0 })
  assert.equal(quiet.feed(JSON.stringify({ type: "tool_use", part: { tool: "write", state: { status: "completed", input: { filePath: "/p/a", content: "x" } } } })).length, 1)
})

test("elapsed time follows event timestamps and previews keep slashes without a directory", () => {
  const renderer = createRenderer({ width: 80 })
  renderer.feed(JSON.stringify({ type: "step_start", timestamp: 1_000_000 }))
  const later = renderer.feed(JSON.stringify({ type: "tool_use", timestamp: 1_012_500, part: { tool: "bash", state: { status: "completed", input: { command: "ls" }, metadata: { exit: 0 } } } })).map(stripAnsi)
  assert.ok(later[0].endsWith("+13 s"), later[0])
  const write = renderer.feed(JSON.stringify({ type: "tool_use", part: { tool: "write", state: { status: "completed", input: { filePath: "/tmp/x/a.py", content: "return float(a / b)" } } } })).map(stripAnsi)
  assert.equal(write[1], "    return float(a / b)")
})
