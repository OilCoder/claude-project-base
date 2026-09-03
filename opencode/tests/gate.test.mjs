import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { checkGateReadiness, gateScript } from "../.opencode/codegen/lib/gate.mjs"

function contract(commands, expected) {
  return {
    contract_id: "c1",
    verification: { commands, invariants: [], ...(expected ? { expected_baseline: expected } : {}) },
  }
}

test("gate wrapper runs every contract command under strict bash", () => {
  const script = gateScript(["npm test", "python3 -m unittest"])
  assert.ok(script.startsWith("#!/usr/bin/env bash"))
  assert.ok(script.includes("set -euo pipefail\nnpm test\npython3 -m unittest\n"))
})

test("readiness: missing script and empty commands are fixable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gate-test-"))
  try {
    const missing = await checkGateReadiness({ directory, contract: contract(["bash checks/gate.sh"]) })
    assert.deepEqual(missing, { ready: false, fixable: true, reasons: ["missing-script:checks/gate.sh"], baseline: [] })
    const empty = await checkGateReadiness({ directory, contract: contract([]) })
    assert.equal(empty.ready, false)
    assert.deepEqual(empty.reasons, ["no-verification-commands"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("readiness: a gate that passes on the baseline does not judge new behavior", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gate-test-"))
  try {
    await mkdir(path.join(directory, "checks"))
    await writeFile(path.join(directory, "checks/pass.sh"), "exit 0\n")
    await writeFile(path.join(directory, "checks/fail.sh"), "exit 3\n")
    const trivial = await checkGateReadiness({ directory, contract: contract(["bash checks/pass.sh"]) })
    assert.equal(trivial.ready, false)
    assert.equal(trivial.fixable, true)
    assert.deepEqual(trivial.reasons, ["gate-passes-on-baseline"])
    assert.deepEqual(trivial.baseline, [{ command: "bash checks/pass.sh", exit_code: 0 }])

    const ready = await checkGateReadiness({ directory, contract: contract(["bash checks/fail.sh"]) })
    assert.equal(ready.ready, true)
    assert.deepEqual(ready.baseline, [{ command: "bash checks/fail.sh", exit_code: 3 }])

    const refactor = await checkGateReadiness({ directory, contract: contract(["bash checks/pass.sh"], "pass") })
    assert.equal(refactor.ready, true)
    const brokenRefactor = await checkGateReadiness({ directory, contract: contract(["bash checks/fail.sh"], "pass") })
    assert.equal(brokenRefactor.ready, false)
    assert.equal(brokenRefactor.fixable, false)
    assert.deepEqual(brokenRefactor.reasons, ["gate-fails-on-baseline"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
