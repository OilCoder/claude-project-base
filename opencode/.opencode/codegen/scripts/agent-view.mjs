#!/usr/bin/env node
// Runs one agent inside its own terminal window: prints the header, streams a
// readable view of the events, keeps the raw events for the runner, and
// signals completion through a done file. Usage: agent-view.mjs <job.json>

import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import readline from "node:readline"

import { createRenderer, dim, green, red, renderHeader } from "../lib/display.mjs"

const job = JSON.parse(await readFile(process.argv[2], "utf8"))
const out = (line) => process.stdout.write(`${line}\n`)

for (const line of renderHeader(job.header)) out(line)
out("")

const events = createWriteStream(job.events_file, { flags: "w" })
const stderr = createWriteStream(job.stderr_file, { flags: "w" })
const renderer = createRenderer({ directory: job.directory, contextTokens: job.header.context_tokens })
const started = Date.now()
let timedOut = false

const child = spawn(job.command, job.args, {
  cwd: job.directory,
  env: { ...process.env, ...job.env, PWD: job.directory },
  stdio: ["ignore", "pipe", "pipe"],
})
const timer = setTimeout(() => {
  timedOut = true
  child.kill("SIGTERM")
}, job.timeout_seconds * 1000)

readline.createInterface({ input: child.stdout }).on("line", (line) => {
  events.write(`${line}\n`)
  for (const rendered of renderer.feed(line)) out(rendered)
})
child.stderr.on("data", (chunk) => {
  stderr.write(chunk)
  process.stdout.write(dim(String(chunk)))
})

child.on("close", async (code, signal) => {
  clearTimeout(timer)
  events.end()
  stderr.end()
  const exitCode = timedOut ? 124 : (code ?? 1)
  const seconds = Math.round((Date.now() - started) / 1000)
  out("")
  out(
    exitCode === 0
      ? `${green("■ terminado")} en ${seconds}s · ${renderer.state.steps} pasos · ${renderer.state.tools} herramientas · ${renderer.state.cost.toFixed(5)} USD`
      : `${red(`■ salida ${exitCode}${signal ? ` (${signal})` : ""}${timedOut ? " · timeout" : ""}`)} en ${seconds}s`,
  )
  await writeFile(
    job.done_file,
    `${JSON.stringify({ exit_code: exitCode, signal: signal ?? null, timed_out: timedOut, seconds }, null, 2)}\n`,
  )
  if (job.hold && process.stdin.isTTY) {
    out(dim("Enter para cerrar esta ventana"))
    process.stdin.resume()
    process.stdin.once("data", () => process.exit(exitCode === 0 ? 0 : 1))
  } else {
    process.exit(exitCode === 0 ? 0 : 1)
  }
})
