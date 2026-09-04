import { spawn } from "node:child_process"

// The single child-process primitive. `firstOutputSeconds` bounds silence: a
// child that writes nothing to stdout before that deadline is killed and
// reported as exit 124, the same code as the overall timeout.
export function runProcess(
  command,
  args,
  { cwd, timeoutSeconds = 900, shell = false, env = {}, firstOutputSeconds = null } = {},
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
    let silent = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutSeconds * 1000)
    const silence = firstOutputSeconds
      ? setTimeout(() => {
          if (stdout.length > 0) return
          silent = true
          child.kill("SIGTERM")
        }, firstOutputSeconds * 1000)
      : null

    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      if (silence) clearTimeout(silence)
      if (silent) stderr += `\n${command} produced no output within ${firstOutputSeconds} s and was stopped\n`
      resolve({
        exitCode: timedOut || silent ? 124 : (code ?? 1),
        signal,
        stdout,
        stderr,
      })
    })
  })
}
