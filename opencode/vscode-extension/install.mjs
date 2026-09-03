#!/usr/bin/env node
// Installs the extension unpacked into the VS Code server extensions folder
// (~/.vscode-server/extensions), which VS Code scans on startup. Reload the
// window afterwards. Pass --dir <path> to target another extensions folder.
import { cp, mkdir, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(await readFile(path.join(here, "package.json"), "utf8"))
const args = process.argv.slice(2)
const dirFlag = args.indexOf("--dir")
const extensions = dirFlag >= 0 ? path.resolve(args[dirFlag + 1]) : path.join(os.homedir(), ".vscode-server/extensions")
const target = path.join(extensions, `${manifest.publisher}.${manifest.name}-${manifest.version}`)

await mkdir(extensions, { recursive: true })
await rm(target, { recursive: true, force: true })
for (const file of ["package.json", "extension.js", "README.md"]) {
  await cp(path.join(here, file), path.join(target, file))
}
console.log(`Installed ${manifest.displayName} ${manifest.version} into ${target}`)
console.log("Reload the VS Code window (Developer: Reload Window) to activate it.")
