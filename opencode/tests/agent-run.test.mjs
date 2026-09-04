import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { DISPLAYS, SERVER_FILE, readServerFile, resolveAttachUrl, resolveDisplay, runAgentProcess, serverAlive } from "../.opencode/codegen/lib/agent-run.mjs"

// A fake `opencode` that echoes its argv as one NDJSON line, or stays silent.
const fakeOpenCode = `#!/usr/bin/env node
if (process.env.FAKE_SILENT) { setTimeout(() => {}, 30000) } else {
console.log(JSON.stringify({type:"text",part:{text:"hola"},argv:process.argv.slice(2),cwd:process.cwd()}))
console.log(JSON.stringify({type:"step_finish",part:{reason:"stop",cost:0.002,tokens:{total:120,input:100,output:20,reasoning:0,cache:{read:0,write:0}}}}))
console.error("stderr line")
process.exit(Number(process.env.FAKE_EXIT || 0)) }
`

async function withFakeOpenCode(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-run-"))
  const bin = path.join(root, "bin")
  await mkdir(bin)
  await writeFile(path.join(bin, "opencode"), fakeOpenCode, { mode: 0o755 })
  const previousPath = process.env.PATH
  process.env.PATH = `${bin}${path.delimiter}${previousPath}`
  try {
    return await run(root)
  } finally {
    process.env.PATH = previousPath
    await rm(root, { recursive: true, force: true })
  }
}

test("resolveDisplay: inline by default, flag and env accepted, removed views rejected with a hint", () => {
  const previous = process.env.CODEGEN_DISPLAY
  delete process.env.CODEGEN_DISPLAY
  try {
    assert.deepEqual(DISPLAYS, ["inline", "tui"])
    assert.equal(resolveDisplay({}), "inline")
    assert.equal(resolveDisplay({ display: "tui" }), "tui")
    process.env.CODEGEN_DISPLAY = "tui"
    assert.equal(resolveDisplay({}), "tui")
    process.env.CODEGEN_DISPLAY = "vscode"
    assert.throws(() => resolveDisplay({}), /Unknown display vscode.*removed on 2026-09-03/)
  } finally {
    if (previous === undefined) delete process.env.CODEGEN_DISPLAY
    else process.env.CODEGEN_DISPLAY = previous
  }
})

test("inline runs opencode in the agent's directory and returns its events", async () => {
  await withFakeOpenCode(async (root) => {
    const result = await runAgentProcess({ directory: root, args: ["run", "--format", "json", "--agent", "builder", "go"], timeoutSeconds: 10 })
    assert.equal(result.exitCode, 0)
    const first = JSON.parse(result.stdout.split("\n")[0])
    assert.deepEqual(first.argv, ["run", "--format", "json", "--agent", "builder", "go"])
    assert.equal(first.cwd, root)
    assert.equal(result.stderr.trim(), "stderr line")
  })
})

test("tui inserts --attach, --dir and --title after run, and refuses to start without CODEGEN_ATTACH", async () => {
  await withFakeOpenCode(async (root) => {
    delete process.env.CODEGEN_ATTACH
    await assert.rejects(
      runAgentProcess({ directory: root, args: ["run", "x"], display: "tui", title: "builder · alpha" }),
      /CODEGEN_ATTACH/,
    )
    process.env.CODEGEN_ATTACH = "http://127.0.0.1:4096/"
    try {
      const result = await runAgentProcess({ directory: root, args: ["run", "--format", "json", "--agent", "builder", "go"], display: "tui", title: "builder · alpha", timeoutSeconds: 10 })
      const first = JSON.parse(result.stdout.split("\n")[0])
      assert.deepEqual(first.argv, ["run", "--attach", "http://127.0.0.1:4096/", "--dir", root, "--title", "builder · alpha", "--format", "json", "--agent", "builder", "go"])
    } finally {
      delete process.env.CODEGEN_ATTACH
    }
  })
})

test("an agent that stays silent is stopped at the first-output deadline with exit 124", async () => {
  await withFakeOpenCode(async (root) => {
    process.env.FAKE_SILENT = "1"
    try {
      const started = Date.now()
      const result = await runAgentProcess({ directory: root, args: ["run", "x"], timeoutSeconds: 20, firstOutputSeconds: 1 })
      assert.equal(result.exitCode, 124)
      assert.match(result.stderr, /no output within 1 s/)
      assert.ok(Date.now() - started < 10000)
    } finally {
      delete process.env.FAKE_SILENT
    }
  })
})

test("resolveAttachUrl trusts the published server only when its pid is alive and the URL answers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-run-server-"))
  const server = http.createServer((request, response) => {
    response.statusCode = request.url === "/global/health" ? 200 : 404
    response.end("{}")
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const url = `http://127.0.0.1:${server.address().port}/`
  try {
    assert.equal(await readServerFile(root), null)
    assert.deepEqual(await resolveAttachUrl(root), { url: null, published: null })
    await mkdir(path.join(root, ".opencode"))
    await writeFile(path.join(root, SERVER_FILE), JSON.stringify({ url, pid: 2 ** 22 - 1, at: "now" }))
    assert.deepEqual(await resolveAttachUrl(root), { url: null, published: url }, "dead pid")
    await writeFile(path.join(root, SERVER_FILE), JSON.stringify({ url: "http://127.0.0.1:1/", pid: process.pid, at: "now" }))
    assert.equal((await resolveAttachUrl(root)).url, "http://127.0.0.1:1/", "our own pid is alive without probing")
    assert.equal(await serverAlive({ url: "http://127.0.0.1:1/", pid: process.ppid }, { timeoutMs: 300 }), false, "another live pid still needs the probe")
    await writeFile(path.join(root, SERVER_FILE), JSON.stringify({ url, pid: process.pid, at: "now" }))
    assert.equal((await resolveAttachUrl(root)).url, url)
    const viaLocalhost = url.replace("127.0.0.1", "localhost")
    await writeFile(path.join(root, SERVER_FILE), JSON.stringify({ url: viaLocalhost, pid: process.pid, at: "now" }))
    assert.equal((await resolveAttachUrl(root)).url, url, "localhost is normalised to 127.0.0.1")
    assert.equal(await serverAlive({ url: "http://127.0.0.1:1/", pid: process.ppid }, { timeoutMs: 300 }), false, "unreachable url")
  } finally {
    server.close()
    await rm(root, { recursive: true, force: true })
  }
})
