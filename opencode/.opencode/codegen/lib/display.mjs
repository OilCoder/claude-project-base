// Human-readable rendering of `opencode run --format json` events, used by the
// per-agent terminal view. Pure functions: feed lines, get printable lines.

const ESC = "\u001b"
const useColor = () => !process.env.NO_COLOR && process.env.CODEGEN_COLOR !== "0"
const paint = (code, text) => (useColor() ? `${ESC}[${code}m${text}${ESC}[0m` : text)
export const dim = (text) => paint("2", text)
export const bold = (text) => paint("1", text)
export const cyan = (text) => paint("36", text)
export const green = (text) => paint("32", text)
export const yellow = (text) => paint("33", text)
export const red = (text) => paint("31", text)

export function formatNumber(value) {
  return String(Math.round(Number(value ?? 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

export function bar(used, total, width = 20) {
  if (!total) return "·".repeat(width)
  const filled = Math.max(0, Math.min(width, Math.round((used / total) * width)))
  return "▇".repeat(filled) + "▁".repeat(width - filled)
}

export function stripAnsi(text) {
  return text.replaceAll(/\u001b\[[0-9;]*m/g, "")
}

function relative(filePath, directory) {
  if (typeof filePath !== "string") return ""
  return directory && filePath.startsWith(`${directory}/`) ? filePath.slice(directory.length + 1) : filePath
}

// header: { title, agent, roles, run_id, attempt, max_attempts, model,
//           context_tokens, lines: [] }
export function renderHeader(header) {
  const rows = [
    `${bold(header.title ?? header.agent ?? "agent")}${header.run_id ? dim(`   run ${header.run_id}`) : ""}${
      header.attempt ? dim(` · intento ${header.attempt}${header.max_attempts ? `/${header.max_attempts}` : ""}`) : ""
    }`,
    `${dim("modelo   ")}${cyan(header.model ?? "?")}`,
    `${dim("roles    ")}${(header.roles ?? []).join(" · ") || "—"}`,
    `${dim("ventana  ")}${header.context_tokens ? `${formatNumber(header.context_tokens)} tokens` : "desconocida"}${dim("  (model-pools.json)")}`,
    ...(header.lines ?? []).map((line) => `${dim("         ")}${line}`),
  ]
  const width = Math.max(...rows.map((row) => stripAnsi(row).length), 40)
  return [`┌${"─".repeat(width + 2)}`, ...rows.map((row) => `│ ${row}`), `└${"─".repeat(width + 2)}`]
}

export function createRenderer({ directory = "", contextTokens = 0 } = {}) {
  const state = { steps: 0, cost: 0, total_tokens: 0, errors: 0, tools: 0 }

  function usageLine(tokens) {
    const total = tokens?.total ?? 0
    state.total_tokens = total
    const pct = contextTokens ? ` ${Math.round((total / contextTokens) * 100)}%` : ""
    return `${dim("uso      ")}${bar(total, contextTokens)}${pct}  ${formatNumber(total)}${
      contextTokens ? ` / ${formatNumber(contextTokens)}` : ""
    }${dim(
      `   entrada ${formatNumber(tokens?.input)} · caché ${formatNumber(tokens?.cache?.read)} · salida ${formatNumber(tokens?.output)} · razonamiento ${formatNumber(tokens?.reasoning)}`,
    )}`
  }

  function feed(line) {
    const trimmed = line.trim()
    if (!trimmed) return []
    let event
    try {
      event = JSON.parse(trimmed)
    } catch {
      return [dim(trimmed)]
    }
    const part = event.part ?? {}
    switch (event.type) {
      case "step_start":
        state.steps += 1
        return [dim(`── paso ${state.steps} ──`)]
      case "tool_use": {
        state.tools += 1
        const input = part.state?.input ?? {}
        const status = part.state?.status
        const ms = part.state?.time ? part.state.time.end - part.state.time.start : null
        const tool = part.tool ?? "tool"
        let detail = part.title ?? ""
        if (tool === "bash") detail = input.command ?? detail
        else if (["read", "write", "edit", "glob", "list"].includes(tool)) {
          detail = relative(input.filePath ?? input.path ?? part.title, directory)
        } else if (tool === "grep") detail = `${input.pattern ?? ""} ${relative(input.path ?? "", directory)}`.trim()
        else if (tool === "webfetch") detail = input.url ?? detail
        else if (tool === "websearch") detail = input.query ?? detail
        const exit = part.state?.metadata?.exit
        const failed = status === "error" || (exit !== undefined && exit !== 0)
        const tail = [
          exit !== undefined && exit !== 0 ? red(`exit ${exit}`) : "",
          status === "error" ? red("error") : "",
          ms !== null ? dim(`${ms} ms`) : "",
        ]
          .filter(Boolean)
          .join(" ")
        const color = failed ? red : tool === "write" || tool === "edit" ? yellow : cyan
        return [`${color(tool.padEnd(9))}${detail}${tail ? `  ${tail}` : ""}`]
      }
      case "text": {
        const text = (part.text ?? "").trim()
        return text ? text.split("\n").map((row) => `${green("▎")} ${row}`) : []
      }
      case "step_finish": {
        state.cost += part.cost ?? 0
        return [
          usageLine(part.tokens),
          dim(`costo acumulado ${state.cost.toFixed(5)} USD · fin de paso: ${part.reason ?? "?"}`),
        ]
      }
      case "error":
      case "session.error": {
        state.errors += 1
        const error = event.error ?? event.properties?.error ?? {}
        return [
          red(`ERROR ${error.name ?? ""} ${error.data?.statusCode ?? ""} ${error.data?.message ?? error.message ?? ""}`.trim()),
        ]
      }
      default:
        return []
    }
  }

  return { feed, state }
}
