#!/bin/bash
# adw-stop-gate.sh — Stop hook: the ADW quality gate chain of the turn
# (diagrams 2-3): lint → format → test, stopping at the first failure. On
# failure it blocks the stop (exit 2) and feeds the labeled errors back to the
# agent, which must fix them before it is allowed to finish. After a fix, the
# next stop attempt re-runs the WHOLE chain from the start. Claude Code caps
# consecutive blocks (~8), which acts as the method's implicit max-iterations.
# Also registered on SubagentStop (matcher ^builder$): there exit 2 is
# informational per current docs — the JSONL log still records the verdict,
# and the loop-back authority for the builder is the test-agent (diagram 4).
set -u

# Consume hook input (JSON on stdin) — required so the pipe does not break.
input=$(cat)

proj="${CLAUDE_PROJECT_DIR:-$PWD}"
hooks_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for gate in lint format test; do
  output=$(bash "$hooks_dir/adw-gate.sh" "$gate" "$proj")
  code=$?
  if [ "$code" -ne 0 ]; then
    {
      echo "[gate:$gate] FAILED — the turn cannot end until every gate passes (lint → format → test)."
      printf '%s\n' "$output" | tail -n 40
      echo "Fix exactly these failures. Do not change anything else. Do not disable rules or delete tests."
    } >&2
    exit 2
  fi
done

exit 0
