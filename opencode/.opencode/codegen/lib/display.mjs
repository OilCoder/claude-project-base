// Human-readable rendering of `opencode run --format json` events, used by the
// per-agent terminal view. Pure functions: feed lines, get printable lines.
//
// The view reads like a transcript: what the agent says as paragraphs, each
// tool call as one short line, and one dim status line per step with context
// use and cost. CODEGEN_VIEW_DETAIL=1 adds the token breakdown per step.

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

// Compact token counts for the status line: 9.9k, 1.0M.
export function compact(value) {
  const n = Number(value ?? 0)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

export function bar(used, total, width = 20) {
  if (!total) return "·".repeat(width)
  const filled = Math.max(0, Math.min(width, Math.round((used / total) * width)))
  return "▇".repeat(filled) + "▁".repeat(width - filled)
}

export function stripAnsi(text) {
  return text.replaceAll(/\u001b\[[0-9;]*m/g, "")
}

// Word-wraps plain text to `width`, keeping existing line breaks.
export function wrap(text, width) {
  const rows = []
  for (const paragraph of String(text).split("\n")) {
    if (paragraph.trim() === "") {
      rows.push("")
      continue
    }
    let current = ""
    for (const word of paragraph.split(/\s+/)) {
      if (current && current.length + 1 + word.length > width) {
        rows.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    }
    if (current) rows.push(current)
  }
  return rows
}

function truncate(text, width) {
  const flat = String(text).replaceAll(/\s+/g, " ").trim()
  return flat.length > width ? `${flat.slice(0, Math.max(0, width - 1))}…` : flat
}

// Preview rows keep their indentation; only the length is capped.
function clip(text, width) {
  const row = String(text).replace(/\s+$/, "")
  return row.length > width ? `${row.slice(0, Math.max(0, width - 1))}…` : row
}

function relative(filePath, directory) {
  if (typeof filePath !== "string") return ""
  return directory && filePath.startsWith(`${directory}/`) ? filePath.slice(directory.length + 1) : filePath
}

// header: { title, agent, roles, run_id, attempt, max_attempts, model,
//           context_tokens, lines: [] }
export function renderHeader(header, { width = 100 } = {}) {
  const inner = Math.max(40, width - 4)
  const rows = [
    `${bold(header.title ?? header.agent ?? "agent")}${header.run_id ? dim(`   run ${header.run_id}`) : ""}${
      header.attempt ? dim(` · intento ${header.attempt}${header.max_attempts ? `/${header.max_attempts}` : ""}`) : ""
    }`,
    `${dim("modelo   ")}${cyan(header.model ?? "?")}`,
    `${dim("roles    ")}${(header.roles ?? []).join(" · ") || "—"}`,
    `${dim("ventana  ")}${header.context_tokens ? `${formatNumber(header.context_tokens)} tokens` : "desconocida"}`,
  ]
  for (const line of header.lines ?? []) {
    const [first, ...rest] = stripAnsi(line).length <= inner - 9 ? [line] : wrap(line, inner - 9)
    rows.push(`${dim("         ")}${first ?? ""}`)
    for (const row of rest) rows.push(`${" ".repeat(9)}${row}`)
  }
  const box = Math.min(inner, Math.max(...rows.map((row) => stripAnsi(row).length), 40))
  return [`┌${"─".repeat(box + 2)}`, ...rows.map((row) => `│ ${row}`), `└${"─".repeat(box + 2)}`]
}

// Files named by an apply_patch text: "*** Add File: path", "*** Update File: path".
export function patchFiles(patchText) {
  return [...String(patchText ?? "").matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((match) => match[1].trim())
}

// The content an agent wrote, so the view shows what was produced and not
// only that something was produced. Capped at `limit` lines.
export function writtenPreview(tool, input, limit) {
  let body = ""
  if (tool === "apply_patch") {
    body = String(input.patchText ?? "")
      .split("\n")
      .filter((row) => !/^\*\*\* (?:Begin|End) Patch/.test(row))
      .join("\n")
  } else if (tool === "write") body = String(input.content ?? "")
  else if (tool === "edit") body = String(input.newString ?? input.new_string ?? "")
  if (!body.trim()) return []
  const rows = body.split("\n")
  const shown = rows.slice(0, limit)
  const rest = rows.length - shown.length
  return rest > 0 ? [...shown, `… ${rest} líneas más`] : shown
}

export function createRenderer({
  directory = "",
  contextTokens = 0,
  width = 100,
  detail = process.env.CODEGEN_VIEW_DETAIL === "1",
  previewLines = Number(process.env.CODEGEN_VIEW_PREVIEW ?? 40),
} = {}) {
  const state = { steps: 0, cost: 0, total_tokens: 0, errors: 0, tools: 0 }
  const textWidth = Math.max(40, width - 2)
  let lastWasText = false

  function statusLine(tokens) {
    const total = tokens?.total ?? 0
    state.total_tokens = total
    const pct = contextTokens ? ` (${Math.round((total / contextTokens) * 100)}%)` : ""
    const context = `${compact(total)}${contextTokens ? ` / ${compact(contextTokens)}` : ""}${pct}`
    return dim(`· paso ${state.steps} · contexto ${context} · ${state.cost.toFixed(4)} USD`)
  }

  function detailLine(tokens) {
    return dim(
      `  entrada ${formatNumber(tokens?.input)} · caché ${formatNumber(tokens?.cache?.read)} · salida ${formatNumber(tokens?.output)} · razonamiento ${formatNumber(tokens?.reasoning)}`,
    )
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
        return []
      case "tool_use": {
        state.tools += 1
        const input = part.state?.input ?? {}
        const status = part.state?.status
        const ms = part.state?.time ? part.state.time.end - part.state.time.start : null
        const tool = part.tool ?? "tool"
        let detailText = part.title ?? ""
        if (tool === "bash") detailText = input.command ?? detailText
        else if (tool === "apply_patch") {
          const files = patchFiles(input.patchText).map((file) => relative(file, directory))
          detailText = files.join(", ") || "patch"
        } else if (["read", "write", "edit", "glob", "list"].includes(tool)) {
          detailText = relative(input.filePath ?? input.path ?? part.title, directory) || input.pattern || ""
        } else if (tool === "grep") detailText = `${input.pattern ?? ""}  ${relative(input.path ?? "", directory)}`.trim()
        else if (tool === "webfetch") detailText = input.url ?? detailText
        else if (tool === "websearch") detailText = input.query ?? detailText
        const exit = part.state?.metadata?.exit
        const failed = status === "error" || (exit !== undefined && exit !== 0)
        const tail = [
          exit !== undefined && exit !== 0 ? red(`exit ${exit}`) : "",
          status === "error" ? red("error") : "",
          ms !== null && ms >= 2000 ? dim(`${(ms / 1000).toFixed(1)} s`) : "",
        ]
          .filter(Boolean)
          .join(" ")
        const writes = tool === "write" || tool === "edit" || tool === "apply_patch"
        const color = failed ? red : writes ? yellow : cyan
        const rows = [`${color("▸")} ${color(tool.padEnd(6))} ${truncate(detailText, textWidth - 10)}${tail ? `  ${tail}` : ""}`]
        if (writes && !failed && previewLines > 0) {
          for (const row of writtenPreview(tool, input, previewLines)) {
            rows.push(dim(`    ${clip(row.replaceAll(`${directory}/`, ""), textWidth - 4)}`))
          }
        }
        // A failed command shows the tail of its output so the reason is visible.
        if (failed) {
          const output = String(part.state?.output ?? part.state?.error ?? "").trim()
          for (const row of output.split("\n").slice(-4)) rows.push(dim(`         ${truncate(row, textWidth - 9)}`))
        }
        lastWasText = false
        return rows
      }
      case "text": {
        const text = (part.text ?? "").trim()
        if (!text) return []
        const rows = wrap(text.replaceAll("**", ""), textWidth).map((row) => (row ? `${green("▎")} ${row}` : green("▎")))
        const out = lastWasText ? rows : ["", ...rows]
        lastWasText = true
        return out
      }
      case "step_finish": {
        state.cost += part.cost ?? 0
        lastWasText = false
        return [statusLine(part.tokens), ...(detail ? [detailLine(part.tokens)] : [])]
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
