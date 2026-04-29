#!/usr/bin/env bash
# SessionStart hook: injects project state into Claude's context at the start
# of every session. Reduces the need for Claude to discover state turn by turn.
#
# Outputs JSON with additionalContext containing:
#   - Current PLAN.md (if exists)
#   - Latest bitácora pending items
#   - Verification commands from project-guidelines.md
#
# Exits 0 silently if there's nothing useful to inject.

set -e

CTX=""

# Active phase from PLAN.md
if [[ -f todo/PLAN.md ]]; then
  ACTIVE_PHASE=$(grep -E "^### Phase " todo/PLAN.md | grep -v "(COMPLETED)" | head -n1 || true)
  if [[ -n "$ACTIVE_PHASE" ]]; then
    CTX="${CTX}Active phase from todo/PLAN.md: ${ACTIVE_PHASE}\n\n"
  fi
fi

# Pending items from latest bitácora
LATEST_BITACORA=$(ls -1t todo/bitacora-*.md 2>/dev/null | head -n1 || true)
if [[ -n "$LATEST_BITACORA" ]]; then
  PENDING=$(grep -E "^- \[ \]" "$LATEST_BITACORA" 2>/dev/null | head -n5 || true)
  if [[ -n "$PENDING" ]]; then
    CTX="${CTX}Pending items from $(basename "$LATEST_BITACORA"):\n${PENDING}\n\n"
  fi
fi

# Verification commands
if [[ -f .claude/rules/project-guidelines.md ]]; then
  VERIF=$(sed -n '/## Verification commands/,/^## /p' .claude/rules/project-guidelines.md \
    | grep -E "^(test|type-check|lint|format):" 2>/dev/null || true)
  if [[ -n "$VERIF" ]]; then
    CTX="${CTX}Verification commands for this project:\n${VERIF}\n\n"
  fi
fi

# Emit nothing if no context to inject
[[ -z "$CTX" ]] && exit 0

# Emit additionalContext as JSON
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}' \
  "$(printf '%b' "$CTX" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')"

exit 0
