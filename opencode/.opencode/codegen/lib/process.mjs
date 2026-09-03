import { spawn } from "node:child_process"

export function runProcess(
  command,
  args,
  { cwd, timeoutSeconds = 900, shell = false, env = {} } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...(cwd ? { PWD: cwd } : {}), ...env },
      shell,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutSeconds * 1000)

    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        signal,
        stdout,
        stderr,
      })
    })
  })
}
