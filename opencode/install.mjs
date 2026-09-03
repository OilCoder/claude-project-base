#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { access, chmod, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { checkRelease } from "./.opencode/codegen/lib/certification.mjs"

const sourceRoot = path.dirname(fileURLToPath(import.meta.url))
const sourceOpenCode = path.join(sourceRoot, ".opencode")
const manifestRelative = ".opencode/.codegen-install.json"
const ignoredOpenCodePaths = new Set([
  "node_modules",
  "package.json",
  "package-lock.json",
  "bun.lock",
  "codegen/runs",
  ".codegen-install.json",
])
const requiredIgnores = [
  ".opencode/node_modules/",
  ".opencode/package.json",
  ".opencode/package-lock.json",
  ".opencode/bun.lock",
  ".opencode/codegen/runs/",
  ".opencode/.codegen-install.json",
]

function usage() {
  return "usage: node install.mjs <project-directory> [--dry-run] [--skip-validation]"
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")))
  const positional = argv.filter((arg) => !arg.startsWith("--"))
  const unknown = [...flags].filter((flag) => !["--dry-run", "--skip-validation"].includes(flag))
  if (positional.length !== 1 || unknown.length) throw new Error(usage())
  return {
    targetRoot: path.resolve(positional[0]),
    dryRun: flags.has("--dry-run"),
    skipValidation: flags.has("--skip-validation"),
  }
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function hash(contents) {
  return createHash("sha256").update(contents).digest("hex")
}

async function readJson(filePath, fallback) {
  if (!(await exists(filePath))) return fallback
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch (error) {
    throw new Error(`Cannot parse ${filePath}: ${error.message}`)
  }
}

async function collectFiles(directory, prefix = "") {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name)
    if ([...ignoredOpenCodePaths].some((ignored) => relative === ignored || relative.startsWith(`${ignored}/`))) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(absolute, relative)))
    else if (entry.isFile()) files.push(relative)
  }
  return files.sort()
}

function mergeDefaults(current, required, preserved, pointer = "") {
  if (Array.isArray(required)) {
    const values = Array.isArray(current) ? [...current] : []
    for (const item of required) {
      if (!values.some((value) => JSON.stringify(value) === JSON.stringify(item))) values.push(item)
    }
    return values
  }
  if (required && typeof required === "object") {
    const result = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {}
    for (const [key, value] of Object.entries(required)) {
      const child = pointer ? `${pointer}.${key}` : key
      if (!(key in result)) result[key] = value
      else result[key] = mergeDefaults(result[key], value, preserved, child)
    }
    return result
  }
  if (current !== required) preserved.push(pointer)
  return current
}

async function prepareManagedFiles(targetRoot) {
  const manifestPath = path.join(targetRoot, manifestRelative)
  const previous = await readJson(manifestPath, { files: {} })
  const files = await collectFiles(sourceOpenCode)
  const copies = []
  const hashes = {}
  const conflicts = []

  for (const relative of files) {
    const source = path.join(sourceOpenCode, relative)
    const target = path.join(targetRoot, ".opencode", relative)
    const sourceContents = await readFile(source)
    const sourceHash = hash(sourceContents)
    hashes[relative] = sourceHash
    if (!(await exists(target))) {
      copies.push({ source, target })
      continue
    }
    const targetHash = hash(await readFile(target))
    if (targetHash === sourceHash) continue
    if (previous.files?.[relative] === targetHash) copies.push({ source, target })
    else conflicts.push(path.join(".opencode", relative))
  }
  return { copies, conflicts, manifestPath, manifest: { schema_version: 1, files: hashes } }
}

async function prepareRootFiles(targetRoot) {
  const sourceConfig = await readJson(path.join(sourceRoot, "opencode.json"), {})
  const targetConfigPath = path.join(targetRoot, "opencode.json")
  const targetConfig = await readJson(targetConfigPath, {})
  const preserved = []
  const mergedConfig = mergeDefaults(targetConfig, sourceConfig, preserved)

  const sourcePackage = await readJson(path.join(sourceRoot, "package.json"), {})
  const targetPackagePath = path.join(targetRoot, "package.json")
  const hasPackage = await exists(targetPackagePath)
  const targetPackage = await readJson(targetPackagePath, hasPackage ? {} : { private: true })
  const scriptConflicts = []
  targetPackage.scripts ??= {}
  for (const [name, command] of Object.entries(sourcePackage.scripts ?? {})) {
    if (["test", "install:target", "certify", "release:check"].includes(name)) continue
    if (targetPackage.scripts[name] && targetPackage.scripts[name] !== command) scriptConflicts.push(`package.json scripts.${name}`)
    else targetPackage.scripts[name] = command
  }

  const gitignorePath = path.join(targetRoot, ".gitignore")
  const gitignore = (await exists(gitignorePath)) ? await readFile(gitignorePath, "utf8") : ""
  const missingIgnores = requiredIgnores.filter((entry) => !gitignore.split(/\r?\n/).includes(entry))
  const mergedGitignore = `${gitignore}${gitignore && !gitignore.endsWith("\n") ? "\n" : ""}${missingIgnores.join("\n")}${missingIgnores.length ? "\n" : ""}`

  return {
    conflicts: scriptConflicts,
    preserved,
    writes: [
      { path: targetConfigPath, contents: `${JSON.stringify(mergedConfig, null, 2)}\n` },
      { path: targetPackagePath, contents: `${JSON.stringify(targetPackage, null, 2)}\n` },
      { path: gitignorePath, contents: mergedGitignore },
    ],
  }
}

async function writeIfChanged(filePath, contents) {
  if ((await exists(filePath)) && (await readFile(filePath, "utf8")) === contents) return false
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
  return true
}

async function main() {
  const { targetRoot, dryRun, skipValidation } = parseArgs(process.argv.slice(2))
  if (!(await exists(targetRoot)) || !(await stat(targetRoot)).isDirectory()) throw new Error(`Target is not a directory: ${targetRoot}`)
  if (targetRoot === sourceRoot) throw new Error("Source and target directories must be different")

  // A target project receives only a certified system: every role must have
  // a qualified configuration for the requests production issues.
  const registry = await readJson(path.join(sourceRoot, ".opencode/codegen/config/model-pools.json"), null)
  if (!registry) throw new Error("Source registry .opencode/codegen/config/model-pools.json is missing")
  const release = checkRelease(registry)
  if (!release.ok) {
    throw new Error(`Release check failed; certify the missing roles with certify.mjs before installing:\n- ${release.missing.join("\n- ")}`)
  }

  const managed = await prepareManagedFiles(targetRoot)
  const root = await prepareRootFiles(targetRoot)
  const conflicts = [...managed.conflicts, ...root.conflicts]
  if (conflicts.length) throw new Error(`Installation conflicts:\n- ${conflicts.join("\n- ")}`)

  console.log(`${dryRun ? "Would install" : "Installing"} OpenCode code-generation system into ${targetRoot}`)
  console.log(`Release check: qualified route complete (builder family ${release.builder_family})`)
  console.log(`Managed files to copy: ${managed.copies.length}`)
  if (root.preserved.length) console.log(`Project settings preserved: ${root.preserved.join(", ")}`)
  if (dryRun) return

  for (const { source, target } of managed.copies) {
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
    await chmod(target, (await stat(source)).mode)
  }
  for (const write of root.writes) await writeIfChanged(write.path, write.contents)
  await writeIfChanged(managed.manifestPath, `${JSON.stringify(managed.manifest, null, 2)}\n`)

  if (!skipValidation) {
    const result = spawnSync("opencode", ["debug", "config"], { cwd: targetRoot, encoding: "utf8" })
    if (result.error) throw new Error(`Cannot run opencode debug config: ${result.error.message}`)
    if (result.status !== 0) throw new Error(`opencode debug config failed:\n${result.stderr || result.stdout}`)
    console.log("OpenCode configuration: valid")
  }
  console.log("Installation complete. Restart OpenCode in the target project.")
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
