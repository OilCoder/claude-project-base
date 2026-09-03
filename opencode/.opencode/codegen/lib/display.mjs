// Human-readable rendering of `opencode run --format json` events, used by the
// per-agent terminal view. Pure functions: feed lines, get printable lines.
//
// The view is a guided transcript: every action as one line in plain
// language with its result and elapsed time, the model's narration folded to
// a short quote (full with CODEGEN_VIEW_DETAIL=1), what it wrote previewed,
// and at the end a numbered digest of the actions, the final report, and one
// status line. Telemetry per step only in detail mode.

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

// Light markdown cleanup for terminal quotes: bold markers and heading hashes.
function plainMarkdown(text) {
  return String(text).replaceAll("**", "").replace(/^#{1,6}\s+/gm, "")
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

// +added −removed from a unified diff or an apply_patch body.
export function diffStats(text) {
  let added = 0
  let removed = 0
  for (const row of String(text ?? "").split("\n")) {
    if (/^\+\+\+ |^--- |^\*\*\* /.test(row)) continue
    if (row.startsWith("+")) added += 1
    else if (row.startsWith("-")) removed += 1
  }
  return { added, removed }
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
  return rest > 0 ? [...shown, `… ${rest} líneas más · v muestra todo · Ctrl+clic en la ruta abre el archivo`] : shown
}

// Plain-language verb for each tool. Unknown tools keep their name.
export const VERBS = {
  read: "Leyó",
  glob: "Buscó archivos",
  list: "Listó",
  grep: "Buscó texto",
  bash: "Ejecutó",
  write: "Escribió",
  edit: "Editó",
  apply_patch: "Escribió",
  webfetch: "Consultó",
  websearch: "Buscó en la web",
  todowrite: "Anotó tareas",
  todoread: "Revisó tareas",
  task: "Delegó",
}

// Describes one tool_use part: verb, object, result, failure cause, preview.
export function describeAction(part, { directory = "", previewLines = 40 } = {}) {
  const tool = part.tool ?? "tool"
  const input = part.state?.input ?? {}
  const metadata = part.state?.metadata ?? {}
  const status = part.state?.status
  const exit = metadata.exit
  const failed = status === "error" || (exit !== undefined && exit !== 0)
  const writes = tool === "write" || tool === "edit" || tool === "apply_patch"
  let verb = VERBS[tool] ?? tool
  let object = part.title ?? ""
  let result = ""

  if (tool === "bash") {
    object = input.command ?? object
    if (exit !== undefined) result = exit === 0 ? "salida 0" : `salida ${exit}`
  } else if (tool === "apply_patch") {
    const files = patchFiles(input.patchText).map((file) => relative(file, directory))
    object = files.join(", ") || "parche"
    const stats = diffStats(metadata.diff ?? input.patchText)
    result = `+${stats.added}${stats.removed ? ` −${stats.removed}` : ""}`
  } else if (tool === "write") {
    object = relative(input.filePath ?? input.path ?? part.title, directory)
    result = `${String(input.content ?? "").split("\n").length} líneas`
  } else if (tool === "edit") {
    object = relative(input.filePath ?? input.path ?? part.title, directory)
    if (!String(input.oldString ?? input.old_string ?? "").length) verb = "Escribió"
    const stats = diffStats(metadata.diff)
    result = metadata.diff ? `+${stats.added} −${stats.removed}` : ""
  } else if (["read", "glob", "list"].includes(tool)) {
    object = relative(input.filePath ?? input.path ?? part.title, directory) || input.pattern || ""
    if (tool === "glob" && input.pattern) object = `${input.pattern}${object && object !== input.pattern ? ` en ${object}` : ""}`
    if (metadata.count !== undefined) result = `${metadata.count} resultados`
  } else if (tool === "grep") {
    object = `"${input.pattern ?? ""}"${input.path ? ` en ${relative(input.path, directory)}` : ""}`
  } else if (tool === "webfetch") object = input.url ?? object
  else if (tool === "websearch") object = `"${input.query ?? ""}"`

  const cause = []
  if (failed) {
    const output = String(part.state?.output ?? metadata.output ?? part.state?.error ?? "").trim()
    for (const row of output.split("\n").filter((r) => r.trim()).slice(-3)) cause.push(row)
  }
  const preview = writes && !failed && previewLines > 0
    ? writtenPreview(tool, input, previewLines).map((row) => (directory ? row.replaceAll(`${directory}/`, "") : row))
    : []
  return { tool, verb, object, result, failed, cause, preview, writes }
}

export function createRenderer({
  directory = "",
  contextTokens = 0,
  width = 100,
  detail = process.env.CODEGEN_VIEW_DETAIL === "1",
  previewLines = Number(process.env.CODEGEN_VIEW_PREVIEW ?? 8),
  now = () => Date.now(),
} = {}) {
  const state = { steps: 0, cost: 0, total_tokens: 0, errors: 0, tools: 0, actions: [], narrations: 0, final_text: "" }
  const textWidth = Math.max(40, width - 2)
  const startedAt = now()
  let pendingReads = []
  let lastText = ""
  let lastWritten = null
  // Elapsed time follows the events' own timestamps when they carry one, so a
  // replay shows the real timing; otherwise the wall clock.
  let firstEventAt = null
  let currentEventAt = null

  const elapsed = () => {
    const ms = firstEventAt !== null ? currentEventAt - firstEventAt : now() - startedAt
    return `+${Math.round(ms / 1000)} s`
  }
  const stamp = (line) => {
    const plain = stripAnsi(line)
    const tag = dim(elapsed())
    const pad = Math.max(2, textWidth - plain.length - stripAnsi(tag).length)
    return `${line}${" ".repeat(pad)}${tag}`
  }
  const mark = (failed) => (failed ? red("✘") : green("✔"))

  function flushReads() {
    if (pendingReads.length === 0) return []
    const files = pendingReads
    pendingReads = []
    state.actions.push({ verb: "Leyó", object: files.length === 1 ? files[0] : `${files.length} archivos`, result: "", failed: false })
    const line = files.length === 1
      ? `${mark(false)} ${bold("Leyó")} ${files[0]}`
      : `${mark(false)} ${bold("Leyó")} ${files.length} archivos ${dim(truncate(files.join(", "), textWidth - 24))}`
    return [stamp(line)]
  }

  function actionLines(part) {
    const action = describeAction(part, { directory, previewLines })
    state.tools += 1
    if (action.tool === "read" && !action.failed) {
      pendingReads.push(action.object)
      return []
    }
    const out = flushReads()
    if (action.writes && !action.failed) lastWritten = { tool: action.tool, object: action.object, input: part.state?.input ?? {} }
    state.actions.push({ verb: action.verb, object: action.object, result: action.result, failed: action.failed })
    const color = action.failed ? red : action.writes ? yellow : (text) => text
    const resultText = action.result ? `  ${action.failed ? red(action.result) : dim(action.result)}` : ""
    out.push(stamp(`${mark(action.failed)} ${bold(action.verb)} ${color(truncate(action.object, textWidth - 30))}${resultText}`))
    for (const row of action.cause) out.push(red(`    ${truncate(row, textWidth - 4)}`))
    for (const row of action.preview) out.push(dim(`    ${clip(row, textWidth - 4)}`))
    if (detail) out.push(dim(`    herramienta ${action.tool}`))
    return out
  }

  // Narration is folded to two lines unless detail is on; the final report is
  // printed in full by finish().
  function narrationLines(text) {
    state.narrations += 1
    const rows = wrap(plainMarkdown(text), textWidth - 2)
    const shown = detail ? rows : rows.slice(0, 2)
    const out = shown.map((row) => `${green("┃")} ${detail ? row : dim(row)}`)
    if (!detail && rows.length > 2) out[out.length - 1] = `${out[out.length - 1]}${dim(" …")}`
    return out
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
    if (typeof event.timestamp === "number") {
      if (firstEventAt === null) firstEventAt = event.timestamp
      currentEventAt = event.timestamp
    }
    switch (event.type) {
      case "step_start":
        state.steps += 1
        return []
      case "tool_use":
        return actionLines(part)
      case "text": {
        const text = (part.text ?? "").trim()
        if (!text) return []
        const out = flushReads()
        lastText = text
        state.final_text = text
        return [...out, ...narrationLines(text)]
      }
      case "step_finish": {
        state.cost += part.cost ?? 0
        state.total_tokens = part.tokens?.total ?? state.total_tokens
        if (!detail) return []
        const t = part.tokens ?? {}
        const pct = contextTokens ? ` (${Math.round((state.total_tokens / contextTokens) * 100)}%)` : ""
        return [
          dim(`· paso ${state.steps} · contexto ${compact(state.total_tokens)}${contextTokens ? ` / ${compact(contextTokens)}` : ""}${pct} · ${state.cost.toFixed(4)} USD`),
          dim(`  entrada ${formatNumber(t.input)} · caché ${formatNumber(t.cache?.read)} · salida ${formatNumber(t.output)} · razonamiento ${formatNumber(t.reasoning)}`),
        ]
      }
      case "error":
      case "session.error": {
        state.errors += 1
        const error = event.error ?? event.properties?.error ?? {}
        return [
          ...flushReads(),
          red(`ERROR ${error.name ?? ""} ${error.data?.statusCode ?? ""} ${error.data?.message ?? error.message ?? ""}`.trim()),
        ]
      }
      default:
        return []
    }
  }

  // Closing digest: every action numbered on one line, then the final report
  // in full, so a reader who fell behind catches up here.
  function finish() {
    const out = flushReads()
    if (state.actions.length > 0) {
      out.push("", bold("Resumen"))
      state.actions.forEach((action, index) => {
        const number = String(index + 1).padStart(2)
        const result = action.result ? `  ${action.failed ? red(action.result) : dim(action.result)}` : ""
        out.push(`${dim(number)} ${action.failed ? red("✘") : green("✔")} ${action.verb} ${truncate(action.object, textWidth - 30)}${result}`)
      })
    }
    if (lastText) {
      out.push("", bold("Informe del agente"))
      for (const row of wrap(plainMarkdown(lastText), textWidth - 2)) out.push(row ? `${green("┃")} ${row}` : green("┃"))
    }
    const pct = contextTokens ? ` · ventana ${Math.round((state.total_tokens / contextTokens) * 100)} %` : ""
    out.push("", dim(`${state.steps} pasos · ${state.tools} acciones · ${state.narrations} intervenciones · ${state.cost.toFixed(4)} USD${pct}`))
    return out
  }

  // Full content of the last write, for the "v" key in the terminal view.
  function expandLast() {
    if (!lastWritten) return [dim("  (nada escrito todavía)")]
    const rows = writtenPreview(lastWritten.tool, lastWritten.input, Number.POSITIVE_INFINITY)
      .map((row) => (directory ? row.replaceAll(`${directory}/`, "") : row))
    return ["", bold(`Contenido completo · ${lastWritten.object}`), ...rows.map((row) => dim(`    ${clip(row, textWidth - 4)}`)), ""]
  }

  return { feed, finish, expandLast, state }
}
