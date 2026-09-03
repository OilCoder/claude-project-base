import assert from "node:assert/strict"
import { execFile as execFileCallback } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

import { resolveDisplay, runAgentProcess } from "../.opencode/codegen/lib/agent-run.mjs"
import { stripAnsi } from "../.opencode/codegen/lib/display.mjs"

const execFile = promisify(execFileCallback)
const hasTmux = await execFile("tmux", ["-V"]).then(() => true, () => false)

const fakeOpenCode = `#!/usr/bin/env node
console.log(JSON.stringify({type:"step_start",part:{}}))
console.log(JSON.stringify({type:"tool_use",part:{tool:"read",title:"a.txt",state:{status:"completed",input:{filePath:process.cwd()+"/a.txt"},time:{start:1,end:3}}}}))
console.log(JSON.stringify({type:"step_finish",part:{reason:"stop",cost:0.002,tokens:{total:1200,input:100,output:20,reasoning:0,cache:{read:1000,write:80}}}}))
console.error("stderr line")
process.exit(Number(process.env.FAKE_EXIT || 0))
`

test("resolveDisplay accepts flag, env, default, and rejects unknown", () => {
  const previousDisplay = process.env.CODEGEN_DISPLAY
  delete process.env.CODEGEN_DISPLAY
  try {
    assert.equal(resolveDisplay({}), "tmux")
    assert.equal(resolveDisplay({ display: "inline" }), "inline")
    process.env.CODEGEN_DISPLAY = "wt"
    assert.equal(resolveDisplay({}), "wt")
    assert.throws(() => resolveDisplay({ display: "gnome" }), /Unknown display/)
  } finally {
    if (previousDisplay === undefined) delete process.env.CODEGEN_DISPLAY
    else process.env.CODEGEN_DISPLAY = previousDisplay
  }
})

test("tmux display runs the agent in its own window, shows the header, and returns the same events", { skip: !hasTmux && "tmux not installed" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-run-"))
  const socket = `codegen-test-${process.pid}`
  const tmux = (...args) => execFile("tmux", ["-L", socket, ...args])
  try {
    const bin = path.join(root, "bin")
    await mkdir(bin)
    await writeFile(path.join(bin, "opencode"), fakeOpenCode, { mode: 0o755 })
    await writeFile(path.join(root, "a.txt"), "hello\n")
    await tmux("new-session", "-d", "-s", "t", "-x", "160", "-y", "50")
    process.env.CODEGEN_TMUX_SOCKET = socket
    process.env.CODEGEN_TMUX_SESSION = "t"
    process.env.CODEGEN_VIEW_HOLD = "0"
    const previousPath = process.env.PATH
    process.env.PATH = `${bin}${path.delimiter}${previousPath}`
    try {
      const result = await runAgentProcess({
        directory: root,
        args: ["run", "--format", "json", "--model", "opencode-go/minimax-m2.7", "--agent", "builder", "do it"],
        timeoutSeconds: 30,
        display: "tmux",
        artifacts: path.join(root, "artifacts"),
        header: { title: "builder · alpha", agent: "builder", roles: ["Builder"], model: "opencode-go/minimax-m2.7", context_tokens: 204800, lines: ["contrato  c.json"] },
      })
      assert.equal(result.exitCode, 0)
      assert.equal(result.stdout.trim().split("\n").length, 3)
      assert.ok(result.stdout.includes('"total":1200'))
      assert.equal(result.stderr.trim(), "stderr line")
      const { stdout: windows } = await tmux("list-windows", "-t", "t", "-F", "#{window_name}")
      assert.ok(windows.includes("builder · alpha"), windows)
      const { stdout: pane } = await tmux("capture-pane", "-p", "-t", "t:builder · alpha")
      const text = stripAnsi(pane)
      assert.ok(text.includes("builder · alpha"))
      assert.ok(text.includes("opencode-go/minimax-m2.7"))
      assert.ok(text.includes("Builder"))
      assert.ok(text.includes("204.800 tokens"))
      assert.ok(text.includes("▸ read   a.txt"))
      assert.ok(text.includes("1.200 / 204.800"))
      assert.ok(text.includes("■ terminado"))
      // Default hold: the window waits for Enter, then closes.
      delete process.env.CODEGEN_VIEW_HOLD
      const held = runAgentProcess({
        directory: root,
        args: ["run", "--format", "json", "--model", "opencode-go/minimax-m2.7", "--agent", "builder", "again"],
        timeoutSeconds: 30,
        display: "tmux",
        artifacts: path.join(root, "artifacts"),
        header: { title: "builder · beta", agent: "builder", model: "opencode-go/minimax-m2.7" },
      })
      const heldResult = await held
      assert.equal(heldResult.exitCode, 0)
      let captured = ""
      for (let i = 0; i < 20 && !captured.includes("Enter para cerrar"); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        captured = stripAnsi((await tmux("capture-pane", "-p", "-t", "t:builder · beta").catch(() => ({ stdout: "" }))).stdout)
      }
      assert.ok(captured.includes("Enter para cerrar esta ventana"), captured)
      await tmux("send-keys", "-t", "t:builder · beta", "Enter")
      let names = "builder · beta"
      for (let i = 0; i < 30 && names.includes("builder · beta"); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        names = (await tmux("list-windows", "-t", "t", "-F", "#{window_name}")).stdout
      }
      assert.ok(!names.includes("builder · beta"), names)
      assert.ok(names.includes("builder · alpha"))
      process.env.CODEGEN_VIEW_HOLD = "0"

      const files = await readdir(path.join(root, "artifacts"))
      assert.ok(files.some((file) => file.endsWith(".done.json")))
      const job = JSON.parse(await readFile(path.join(root, "artifacts", files.find((file) => file.endsWith(".job.json"))), "utf8"))
      assert.ok(job.env.PATH.startsWith(bin))
      assert.ok(!("HOMEBREW_SECRET" in job.env))
    } finally {
      process.env.PATH = previousPath
      delete process.env.CODEGEN_TMUX_SOCKET
      delete process.env.CODEGEN_TMUX_SESSION
      delete process.env.CODEGEN_VIEW_HOLD
    }
  } finally {
    await tmux("kill-server").catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})
