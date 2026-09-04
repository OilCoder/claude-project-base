import assert from "node:assert/strict"
import { execFile as execFileCallback } from "node:child_process"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

const execFile = promisify(execFileCallback)
const installer = path.resolve("install.mjs")

async function exists(filePath) {
  return access(filePath).then(() => true, () => false)
}

test("installer dry-run makes no changes", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "codegen-install-dry-"))
  try {
    const { stdout } = await execFile(process.execPath, [installer, target, "--dry-run"])
    assert.match(stdout, /Would install OpenCode/)
    assert.equal(await exists(path.join(target, ".opencode")), false)
    assert.equal(await exists(path.join(target, "opencode.json")), false)
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})

test("installer copies runtime files and safely merges project configuration", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "codegen-install-"))
  try {
    await writeFile(
      path.join(target, "opencode.json"),
      `${JSON.stringify({ share: "manual", instructions: ["PROJECT.md"], provider: { openai: { options: { organization: "example" } } } }, null, 2)}\n`,
    )
    await writeFile(path.join(target, "package.json"), `${JSON.stringify({ name: "target", scripts: { lint: "eslint ." } }, null, 2)}\n`)
    await writeFile(path.join(target, ".gitignore"), "dist/\n")

    const first = await execFile(process.execPath, [installer, target, "--skip-validation"])
    assert.match(first.stdout, /Installation complete/)
    assert.equal(await exists(path.join(target, ".opencode", "agents", "builder.md")), true)
    assert.equal(await exists(path.join(target, ".opencode", "codegen", "lib", "model-selection.mjs")), true)
    assert.equal(await exists(path.join(target, ".opencode", "node_modules")), false)
    assert.equal(await exists(path.join(target, ".opencode", "codegen", "runs")), false)

    const config = JSON.parse(await readFile(path.join(target, "opencode.json"), "utf8"))
    assert.equal(config.share, "manual")
    assert.deepEqual(config.instructions, ["PROJECT.md", ".opencode/instructions/codegen.md"])
    assert.equal(config.provider.openai.options.organization, "example")
    assert.ok(config.enabled_providers.includes("opencode-go"))

    const packageJson = JSON.parse(await readFile(path.join(target, "package.json"), "utf8"))
    assert.equal(packageJson.scripts.lint, "eslint .")
    assert.equal(packageJson.scripts.orchestrate, "node .opencode/codegen/scripts/orchestrate.mjs")
    assert.equal(packageJson.scripts.test, undefined)
    assert.equal(packageJson.scripts["install:target"], undefined)
    assert.equal(packageJson.scripts.certify, undefined)
    assert.equal(packageJson.scripts["release:check"], undefined)
    assert.equal(config.default_agent, "supervisor")
    assert.equal(await exists(path.join(target, ".opencode", "agents", "supervisor.md")), true)
    assert.equal(await exists(path.join(target, ".opencode", "tools", "codegen_workflow.js")), true)
    assert.equal(await exists(path.join(target, ".opencode", "codegen", "scripts", "certify.mjs")), true)
    const gitignore = await readFile(path.join(target, ".gitignore"), "utf8")
    assert.match(gitignore, /^dist\/$/m)
    assert.match(gitignore, /^\.opencode\/codegen\/runs\/$/m)

    const second = await execFile(process.execPath, [installer, target, "--skip-validation"])
    assert.match(second.stdout, /Managed files to copy: 0/)
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})

test("installer refuses to overwrite a modified managed file", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "codegen-install-conflict-"))
  try {
    await execFile(process.execPath, [installer, target, "--skip-validation"])
    const managedFile = path.join(target, ".opencode", "instructions", "codegen.md")
    await writeFile(managedFile, "project customization\n")

    await assert.rejects(
      execFile(process.execPath, [installer, target, "--skip-validation"]),
      (error) => error.code === 1 && error.stderr.includes("Installation conflicts") && error.stderr.includes(".opencode/instructions/codegen.md"),
    )
    assert.equal(await readFile(managedFile, "utf8"), "project customization\n")
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})

test("the workflow tool starts runners through node and decides the display once per operation", async () => {
  const source = await readFile(path.resolve(".opencode/tools/codegen_workflow.js"), "utf8")
  assert.ok(!source.includes("process.execPath"), "process.execPath is the OpenCode binary inside a tool")
  assert.match(source, /executeFile\(nodeBinary/)
  assert.match(source, /"--display", choice\.display/)
  assert.match(source, /CODEGEN_ATTACH: choice\.url/)
  const { chooseDisplay } = await import("../.opencode/tools/codegen_workflow.js")
  const root = await mkdtemp(path.join(os.tmpdir(), "codegen-tool-"))
  try {
    assert.deepEqual((await chooseDisplay(root, undefined)).display, "inline")
    assert.match((await chooseDisplay(root, "vscode")).reason, /no longer a display/)
    await assert.rejects(chooseDisplay(root, "tui"), /live OpenCode server/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
