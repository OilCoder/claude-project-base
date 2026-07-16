#!/bin/bash
# adw-stop-gate.sh — Stop hook: the ADW quality gate of the turn (diagram 1).
# Runs the lint gate over the whole project; on failure it blocks the stop
# (exit 2) and feeds the errors back to the agent, which must fix them before
# it is allowed to finish. Claude Code caps consecutive blocks (~8), which acts
# as the method's implicit max-iterations.
set -u

# Consume hook input (JSON on stdin) — required so the pipe does not break.
input=$(cat)

proj="${CLAUDE_PROJECT_DIR:-$PWD}"
hooks_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

output=$(bash "$hooks_dir/adw-gate.sh" lint "$proj")
code=$?

if [ "$code" -ne 0 ]; then
  {
    echo "[gate:lint] FAILED — the turn cannot end until lint passes."
    printf '%s\n' "$output" | tail -n 40
    echo "Fix exactly these errors. Do not change anything else. Do not disable rules."
  } >&2
  exit 2
fi

exit 0
