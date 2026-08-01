#!/bin/bash
# adw-precompact-snapshot.sh — PreCompact hook: safety net for compactions that
# arrive before the directed one (esp. auto-compact). PreCompact cannot inject
# instructions into the summary — what it CAN do is dump mechanical state to
# disk so the post-compact ritual (rules/context-discipline.md) finds ground
# truth in adw/estado.md even if the orchestrator didn't update it in time.
set -u

input=$(cat)
proj="${CLAUDE_PROJECT_DIR:-$PWD}"
trigger=$(printf '%s' "$input" | jq -r '.compaction_trigger // "unknown"' 2>/dev/null)

mkdir -p "$proj/adw"
estado="$proj/adw/estado.md"

{
  echo ""
  echo "<!-- snapshot pre-compact ($trigger) $(date '+%Y-%m-%d %H:%M') -->"
  echo "<!-- git: $(git -C "$proj" branch --show-current 2>/dev/null || echo 'sin repo') | $(git -C "$proj" status --porcelain 2>/dev/null | wc -l) archivos modificados -->"
  last_gate=$(tail -1 "$proj"/.claude/adw-runs/*.jsonl 2>/dev/null | jq -r '"último gate: \(.gate) → \(if .passed then "PASS" else "FAIL" end)"' 2>/dev/null)
  [ -n "${last_gate:-}" ] && echo "<!-- $last_gate -->"
} >> "$estado"

exit 0
