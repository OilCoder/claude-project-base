#!/bin/bash
# adw-stop-gate.sh — Stop hook: the ADW quality gate chain of the turn
# (diagrams 2-3): lint → format → test, stopping at the first failure. On
# failure it blocks the stop (exit 2) and feeds the labeled errors back to the
# agent, which must fix them before it is allowed to finish. After a fix, the
# next stop attempt re-runs the WHOLE chain from the start. Claude Code caps
# consecutive blocks (~8), which acts as the method's implicit max-iterations.
# Main-session Stop only. Deliberately NOT registered on SubagentStop: exit 2
# is informational there, and the chain already runs twice per phase (builder
# self-check + test-agent verdict) — a third run decided nothing and cost the
# most idle minutes of the cycle.
set -u

# Consume hook input (JSON on stdin) — required so the pipe does not break.
input=$(cat)

proj="${CLAUDE_PROJECT_DIR:-$PWD}"
hooks_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Short-circuit: skip the chain when the working tree is unchanged since the
# last PASS. Orchestration-only turns (dispatch, conciliate, report) pay the
# full suite otherwise — measured in the field: 50-200 chain runs/day, most
# on turns that touched no code. The method's own state (adw/, .claude/) is
# excluded from the fingerprint: state.md/log.md change nearly every
# turn and cannot affect lint/format/test. Any doubt (no git, no sha256sum,
# error) → empty fingerprint → the chain runs; the safe failure is rigor.
tree_fingerprint() {
  command -v sha256sum > /dev/null 2>&1 || return 1
  git -C "$proj" rev-parse --is-inside-work-tree > /dev/null 2>&1 || return 1
  {
    git -C "$proj" rev-parse HEAD 2>/dev/null
    git -C "$proj" status --porcelain -- . ':!adw' ':!.claude' 2>/dev/null
    git -C "$proj" diff HEAD -- . ':!adw' ':!.claude' 2>/dev/null
    # Untracked content is invisible to `git diff`: stat every untracked file.
    git -C "$proj" status --porcelain -- . ':!adw' ':!.claude' 2>/dev/null \
      | grep '^??' | cut -c4- \
      | while IFS= read -r p; do
          find "$proj/$p" -type f -printf '%p %s %T@\n' 2>/dev/null
        done
  } | sha256sum | cut -d' ' -f1
}

fp_file="$proj/.claude/adw-runs/.stopgate-pass-fingerprint"
fp="$(tree_fingerprint)" || fp=""
if [ -n "$fp" ] && [ -f "$fp_file" ] && [ "$fp" = "$(cat "$fp_file" 2>/dev/null)" ]; then
  exit 0
fi

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

# Full chain green: remember this tree so identical stops skip the chain.
# The fingerprint was taken BEFORE the chain ran; if a test mutated tracked
# files the saved value is already stale and the next stop re-runs — the
# error direction is an extra run, never a skipped one.
if [ -n "$fp" ]; then
  mkdir -p "$(dirname "$fp_file")"
  printf '%s' "$fp" > "$fp_file"
fi

exit 0
