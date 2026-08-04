#!/bin/bash
# check-dangerous-bash.sh — PreToolUse hook (Bash): blocks destructive commands by
# literal substring match on tool_input.command. Never use the hook "if" field for
# this — it is Claude Code's fuzzy internal risk heuristic, not a literal grep, and
# it over-fires on benign multi-line bash (for-loops, heredocs, pipes). Confirmed in
# two independent field deployments: 13/13 tracked blocks were false positives, zero
# genuinely destructive commands were ever caught by it. See rules/hooks-policy.md.
set -u

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)

case "$cmd" in
  *"rm -rf "*)
    echo "BLOCKED: rm -rf is restricted. Delete specific files instead, or ask the user for explicit approval." >&2
    exit 2
    ;;
  *"git push --force"*|*"git push -f"*)
    echo "BLOCKED: force-push requires explicit user approval." >&2
    exit 2
    ;;
  *"git reset --hard"*)
    echo "BLOCKED: git reset --hard discards uncommitted work. Ask the user before proceeding." >&2
    exit 2
    ;;
  *"git commit --no-verify"*)
    echo "BLOCKED: --no-verify skips pre-commit hooks. Fix the underlying issue instead." >&2
    exit 2
    ;;
esac

exit 0
