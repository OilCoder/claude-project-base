import { access, readFile } from "node:fs/promises"
import path from "node:path"

export function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near: ${key ?? "end of command"}`)
    }
    result[key.slice(2)] = value
  }
  return result
}

export async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export function newRunId() {
  return `${new Date().toISOString().replaceAll(/[-:.]/g, "").slice(0, 15)}Z-${process.pid}`
}

export async function loadRegistry(systemRoot) {
  return JSON.parse(
    await readFile(path.join(systemRoot, ".opencode/codegen/config/model-pools.json"), "utf8"),
  )
}

export function resolveInsideProject(directory, relativeOrAbsolute, label) {
  const resolved = path.resolve(directory, relativeOrAbsolute)
  const relative = path.relative(directory, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside the target project`)
  }
  return { absolute: resolved, relative }
}
