import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function summarizeEvents(text) {
  const summary = {
    steps: 0,
    input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reported_cost: 0,
    final_text: "",
    errors: [],
  }

  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }

    if (event.type === "step_finish") {
      const tokens = event.part?.tokens ?? {}
      summary.steps += 1
      summary.input_tokens += tokens.input ?? 0
      summary.output_tokens += tokens.output ?? 0
      summary.reasoning_tokens += tokens.reasoning ?? 0
      summary.cache_read_tokens += tokens.cache?.read ?? 0
      summary.cache_write_tokens += tokens.cache?.write ?? 0
      summary.reported_cost += event.part?.cost ?? 0
    }

    if (event.type === "text" && typeof event.part?.text === "string") {
      summary.final_text = event.part.text.slice(-2000)
    }

    if (event.type === "error" || event.type === "session.error") {
      const error = event.error ?? event.properties?.error
      summary.errors.push({
        name: error?.name ?? "Error",
        status_code: error?.data?.statusCode ?? null,
        message: error?.data?.message ?? error?.message ?? "Unknown error",
        retryable: error?.data?.isRetryable ?? null,
      })
    }
  }

  return summary
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  const input = process.argv[2]
  if (!input) throw new Error("usage: run-metrics.mjs <events.jsonl>")
  const summary = summarizeEvents(await readFile(input, "utf8"))
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}
