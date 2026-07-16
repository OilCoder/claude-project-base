#!/bin/bash
# adw-gate.sh — run one named gate, log the verdict as a JSONL event, exit with
# the gate's exit code (0 = pass). No resolved command = pass (exit 0, no event).
# Usage: adw-gate.sh <lint|format|test> [project_dir]
# Log: <project>/.claude/adw-runs/YYYY-MM-DD.jsonl (one JSON object per event).
set -u

gate="${1:?usage: adw-gate.sh <lint|format|test> [project_dir]}"
proj="${2:-${CLAUDE_PROJECT_DIR:-$PWD}}"
hooks_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cmd="$(bash "$hooks_dir/adw-detect.sh" "$gate" "$proj")"
if [ -z "$cmd" ]; then
  exit 0
fi

start_ms=$(date +%s%3N)
output=$(cd "$proj" && bash -c "$cmd" 2>&1)
code=$?
end_ms=$(date +%s%3N)

# JSONL event — the study artifact of the method. jq handles all escaping.
runs_dir="$proj/.claude/adw-runs"
mkdir -p "$runs_dir"
if command -v jq > /dev/null 2>&1; then
  jq -cn \
    --arg ts "$(date -Iseconds)" \
    --arg gate "$gate" \
    --arg cmd "$cmd" \
    --argjson exit_code "$code" \
    --argjson passed "$([ "$code" -eq 0 ] && echo true || echo false)" \
    --argjson duration_ms "$((end_ms - start_ms))" \
    --arg output_tail "$(printf '%s' "$output" | tail -c 2000)" \
    '{ts: $ts, gate: $gate, cmd: $cmd, exit_code: $exit_code, passed: $passed, duration_ms: $duration_ms, output_tail: $output_tail}' \
    >> "$runs_dir/$(date +%F).jsonl"
fi

printf '%s\n' "$output"
exit "$code"
