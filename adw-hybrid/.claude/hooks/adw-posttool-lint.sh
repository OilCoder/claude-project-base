#!/bin/bash
# adw-posttool-lint.sh — PostToolUse hook (Edit|Write): lint only the touched
# file for immediate feedback (micro-loop). The Stop gate remains the real
# authority; this hook just shortens the loop. Exit 2 feeds stderr back to the
# agent. Only handles autodetected stacks (.py via ruff); projects using an
# adw-gates.conf override are covered by the Stop gate alone.
set -u

input=$(cat)
proj="${CLAUDE_PROJECT_DIR:-$PWD}"
hooks_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$file_path" ] && exit 0
[ -f "$file_path" ] || exit 0

# Gates are project-level: if no lint gate resolves for THIS project (e.g. the
# project root is not a Python/JS project), the micro-loop does not apply.
if [ -z "$(bash "$hooks_dir/adw-detect.sh" lint "$proj")" ]; then
  exit 0
fi

case "$file_path" in
  *.py)
    if command -v ruff > /dev/null 2>&1; then
      ruff_cmd="ruff"
    elif command -v uvx > /dev/null 2>&1; then
      ruff_cmd="uvx ruff"
    else
      exit 0
    fi
    output=$(cd "$proj" && $ruff_cmd check "$file_path" 2>&1)
    code=$?
    # Log the micro-loop verdict too — the study artifact must show every iteration.
    runs_dir="$proj/.claude/adw-runs"
    mkdir -p "$runs_dir"
    jq -cn \
      --arg ts "$(date -Iseconds)" \
      --arg file "$file_path" \
      --argjson exit_code "$code" \
      --argjson passed "$([ "$code" -eq 0 ] && echo true || echo false)" \
      --arg output_tail "$(printf '%s' "$output" | tail -c 2000)" \
      '{ts: $ts, gate: "lint-file", file: $file, exit_code: $exit_code, passed: $passed, output_tail: $output_tail}' \
      >> "$runs_dir/$(date +%F).jsonl" 2>/dev/null
    if [ "$code" -ne 0 ]; then
      {
        echo "[gate:lint-file] $file_path has lint errors — fix them now:"
        printf '%s\n' "$output" | tail -n 20
      } >&2
      exit 2
    fi
    ;;
esac

exit 0
