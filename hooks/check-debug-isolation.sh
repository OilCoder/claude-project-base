#!/usr/bin/env bash
# PostToolUse hook: warns when a file under src/ | lib/ | app/ imports from debug/.
# Reinforces logging-policy.md: debug scripts must never be imported by production code.
#
# Reads tool input as JSON on stdin, exits 0 silently unless a violation is found,
# in which case it emits additionalContext for Claude to see.

set -e

INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" \
  | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
  | head -n1)

[[ -z "$FILE_PATH" ]] && exit 0

# Only check production source folders.
if [[ ! "$FILE_PATH" =~ /(src|lib|app|pipeline)/ ]]; then
  exit 0
fi

[[ ! -f "$FILE_PATH" ]] && exit 0

# Match common debug-import patterns across Python, JS/TS, Go, Ruby.
if grep -qE '(from[[:space:]]+debug[[:space:]\.]|import[[:space:]]+debug[[:space:]\.;]|from[[:space:]]+["'"'"'][^"'"'"']*debug|require\([^)]*debug)' "$FILE_PATH"; then
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "WARNING: $FILE_PATH appears to import from debug/. Per logging-policy.md, debug scripts must never be imported by production code. Move the logic out of debug/ or remove the import."
  }
}
EOF
fi

exit 0
