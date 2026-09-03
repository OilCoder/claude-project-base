#!/usr/bin/env node
// Runs one agent inside its own terminal window: prints the header, streams a
// readable view of the events, keeps the raw events for the runner, and
// signals completion through a done file. Usage: agent-view.mjs <job.json>

import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import readline from "node:readline"

import { createRenderer, dim, green, red, renderHeader } from "../lib/display.mjs"

const out = (line) => process.stdout.write(`${line}\n`)
const width = process.stdout.columns || 100
const args = process.argv.slice(2)

// --replay <events.jsonl> [--pace]: render a finished run again, at reading
// speed with --pace (Enter advances one step). The header comes from the
// sibling job file when it exists.
if (args[0] === "--replay") {
  const eventsFile = args[1]
  if (!eventsFile) throw new Error("usage: agent-view.mjs --replay <events.jsonl> [--pace]")
  const pace = args.includes("--pace")
  const jobFile = eventsFile.replace(/\.events\.jsonl$/, ".job.json")
  let header = { title: eventsFile.split("/").at(-1) }
  let directory = ""
  try {
    const replayJob = JSON.parse(await readFile(jobFile, "utf8"))
    header = replayJob.header
    directory = replayJob.directory
  } catch {
    // no job file next to the events: minimal header
  }
  for (const line of renderHeader(header, { width })) out(line)
  out("")
  const renderer = createRenderer({ directory, contextTokens: header.context_tokens, width })
  const waitForEnter = () => new Promise((resolve) => { process.stdin.resume(); process.stdin.once("data", resolve) })
  for (const line of (await readFile(eventsFile, "utf8")).split("\n")) {
    for (const rendered of renderer.feed(line)) out(rendered)
    if (pace && process.stdin.isTTY && line.includes('"step_finish"')) {
      process.stdout.write(dim("  ⏎ siguiente paso"))
      await waitForEnter()
      process.stdout.write("\r" + " ".repeat(20) + "\r")
    }
  }
  for (const line of renderer.finish()) out(line)
  process.exit(0)
}

const job = JSON.parse(await readFile(args[0], "utf8"))

for (const line of renderHeader(job.header, { width })) out(line)
out("")

const events = createWriteStream(job.events_file, { flags: "w" })
const stderr = createWriteStream(job.stderr_file, { flags: "w" })
const renderer = createRenderer({ directory: job.directory, contextTokens: job.header.context_tokens, width })
const started = Date.now()
let timedOut = false

// Keys while the agent runs: v prints the full content of the last write.
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (key) => {
    if (key === "v" || key === "V") for (const line of renderer.expandLast()) out(line)
    else if (key === "\u0003") process.exit(130)
  })
}

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
  for (const line of renderer.finish()) out(line)
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
    out(dim("Enter para cerrar esta ventana · v muestra el último archivo escrito"))
    process.stdin.on("data", (key) => {
      if (key === "\r" || key === "\n") process.exit(exitCode === 0 ? 0 : 1)
    })
  } else {
    process.exit(exitCode === 0 ? 0 : 1)
  }
})
