#!/bin/bash
# adw-protect-gates.sh — PreToolUse hook (builder only): the validation gate
# scripts in adw/gates/ are written by the test-agent BEFORE the builder runs
# (validation-first pattern) and the builder must not touch them — it builds
# AGAINST the gate, it does not negotiate with it. Blocks Edit/Write targeting
# adw/gates/ and Bash commands that would mutate anything in that folder.
# Executing a gate (bash adw/gates/fase-N.sh) is allowed and encouraged.
set -u

input=$(cat)

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)

case "$tool" in
  Edit|Write)
    file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
    case "$file_path" in
      */adw/gates/*|adw/gates/*)
        echo "BLOCKED: $file_path is a validation gate. The builder cannot edit gates — build the code so the gate passes, or report via your final message that the gate itself is wrong (the test-agent owns it)." >&2
        exit 2
        ;;
    esac
    ;;
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
    if printf '%s' "$cmd" | grep -q 'adw/gates'; then
      # Allow read/execute; block write-ish operations on the gates folder.
      if printf '%s' "$cmd" | grep -qE '(>|>>)[[:space:]]*[^[:space:]]*adw/gates|(rm|mv|cp|tee|chmod|truncate)[[:space:]][^|;]*adw/gates|sed[[:space:]]+-i[^|;]*adw/gates'; then
        echo "BLOCKED: this command would modify adw/gates/. The builder cannot touch gates — run them (bash adw/gates/fase-N.sh), never rewrite them." >&2
        exit 2
      fi
    fi
    ;;
esac

exit 0
