#!/bin/bash
# adw-context-watch.sh — UserPromptSubmit hook: estimate context usage from the
# transcript size and inject a [context-watch] notice past the threshold, so the
# orchestrator updates adw/state.md and proposes a directed /compact BEFORE
# auto-compact (~95%, non-directable) fires. Stdout of UserPromptSubmit is
# injected into context.
# Heuristic: transcript JSONL bytes ≈ context tokens × BYTES_PER_TOKEN. Crude
# but monotonic — calibrate per project in adw-gates.conf:
#   context_watch_kb=<KB threshold>   (default 1200; compact at phase boundaries)
set -u

input=$(cat)
proj="${CLAUDE_PROJECT_DIR:-$PWD}"

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
[ -f "$transcript" ] || exit 0

threshold_kb=1200
conf="$proj/adw-gates.conf"
if [ -f "$conf" ]; then
  line=$(grep -E '^context_watch_kb=' "$conf" 2>/dev/null | tail -1)
  [ -n "$line" ] && threshold_kb="${line#*=}"
fi

size_kb=$(( $(stat -c%s "$transcript" 2>/dev/null || echo 0) / 1024 ))

if [ "$size_kb" -ge $(( threshold_kb * 2 )) ]; then
  echo "[context-watch] CRITICAL: transcript ~${size_kb}KB (threshold ${threshold_kb}KB, already doubled). Automatic compaction is near. Finish the current micro-step NOW, update adw/state.md, and propose a directed /compact to the user (see rules/context-discipline.md)."
elif [ "$size_kb" -ge "$threshold_kb" ]; then
  echo "[context-watch] Context above threshold (~${size_kb}KB / ${threshold_kb}KB). After the current micro-step, update adw/state.md and propose a directed /compact to the user (see rules/context-discipline.md)."
fi

exit 0
