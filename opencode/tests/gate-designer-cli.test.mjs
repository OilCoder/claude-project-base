import assert from "node:assert/strict"
import { execFile as execFileCallback } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const execFile = promisify(execFileCallback)
const here = path.dirname(fileURLToPath(import.meta.url))
const systemRoot = path.resolve(here, "..")

// Fake gate designer: writes a check under .codegen-contract/checks that fails
// until alpha is implemented, and points gate.sh at it. FAKE_SCOPE_LEAK makes
// it also touch product code, which the runner must reject.
const fakeOpenCode = `#!/usr/bin/env node
const fs = require("node:fs")
fs.mkdirSync(".codegen-contract/checks", { recursive: true })
fs.writeFileSync(".codegen-contract/checks/test_alpha_contract.py", "import unittest\\nfrom lib.alpha import alpha\\nclass T(unittest.TestCase):\\n    def test(self):\\n        self.assertEqual(alpha(2), 4)\\n")
fs.writeFileSync(".codegen-contract/gate.sh", "#!/usr/bin/env bash\\nset -euo pipefail\\npython3 -m unittest .codegen-contract/checks/test_alpha_contract.py\\n")
if (process.env.FAKE_SCOPE_LEAK) fs.writeFileSync("lib/alpha.py", "def alpha(value):\\n    return value * 2\\n")
console.log(JSON.stringify({type:"step_finish",part:{cost:0.001,tokens:{input:5,output:5,reasoning:0,cache:{read:0,write:0}}}}))
`

async function project() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gate-designer-test-"))
  const bin = path.join(directory, "bin-fake")
  await mkdir(bin)
  await writeFile(path.join(bin, "opencode"), fakeOpenCode, { mode: 0o755 })
  await cp(path.join(here, "fixtures/orchestrator-basic/lib"), path.join(directory, "lib"), { recursive: true })
  await mkdir(path.join(directory, ".codegen-contract"))
  // A gate that passes on the baseline: it judges nothing.
  await writeFile(path.join(directory, ".codegen-contract/gate.sh"), "#!/usr/bin/env bash\ntrue\n")
  await writeFile(
    path.join(directory, ".codegen-contract/contract.json"),
    JSON.stringify({
      contract_id: "alpha",
      objective: "Implement alpha",
      allowed_to_modify: ["lib/alpha.py"],
      requirements: ["alpha doubles its input"],
      verification: { commands: ["bash .codegen-contract/gate.sh"], invariants: [] },
    }),
  )
  await writeFile(path.join(directory, ".gitignore"), "bin-fake/\n__pycache__/\n")
  const git = (...args) => execFile("git", ["-c", "user.name=t", "-c", "user.email=t@localhost", ...args], { cwd: directory })
  await git("init", "-q", "-b", "main")
  await git("add", ".")
  await git("commit", "-q", "-m", "baseline")
  return { directory, bin }
}

function run(tree, env = {}) {
  return execFile(
    process.execPath,
    [path.join(systemRoot, ".opencode/codegen/scripts/run-gate-designer.mjs"), "--contract", ".codegen-contract/contract.json", "--work-class", "localized-low-risk-code-change", "--minimum-status", "candidate", "--exclude-family", "qwen"],
    { cwd: tree.directory, env: { ...process.env, PATH: `${tree.bin}${path.delimiter}${process.env.PATH}`, PYTHONDONTWRITEBYTECODE: "1", ...env } },
  ).then(
    (result) => ({ code: 0, ...result }),
    (error) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }),
  )
}

test("gate designer turns a trivial gate into one that fails on the baseline", async () => {
  const tree = await project()
  try {
    const result = await run(tree)
    assert.equal(result.code, 0, result.stderr)
    const summary = JSON.parse(result.stdout)
    assert.equal(summary.result, "GATE_READY")
    assert.deepEqual(summary.readiness_before.reasons, ["gate-passes-on-baseline"])
    assert.equal(summary.readiness_after.ready, true)
    assert.notEqual(summary.readiness_after.baseline[0].exit_code, 0)
    assert.deepEqual(summary.changed_files, [".codegen-contract/checks/test_alpha_contract.py", ".codegen-contract/gate.sh"])
    assert.equal(summary.attempts[0].configuration.family, "minimax")
    assert.ok((await readFile(path.join(tree.directory, "lib/alpha.py"), "utf8")).includes("NotImplementedError"))
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})

test("gate designer that touches product code is rejected", async () => {
  const tree = await project()
  try {
    const result = await run(tree, { FAKE_SCOPE_LEAK: "1" })
    assert.equal(result.code, 1)
    const summary = JSON.parse(result.stdout)
    assert.equal(summary.result, "SCOPE_FAIL")
    assert.deepEqual(summary.outside_scope, ["lib/alpha.py"])
  } finally {
    await rm(tree.directory, { recursive: true, force: true })
  }
})
