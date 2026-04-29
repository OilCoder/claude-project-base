#!/usr/bin/env bash
# Statusline hook: renders the prompt status line on every Claude turn.
# Output format: <branch><dirty> | <active phase> | <last bitácora age>

set -e

# Branch + dirty indicator
BRANCH=$(git branch --show-current 2>/dev/null || echo "")
DIRTY=""
if [[ -n "$BRANCH" ]]; then
  PORCELAIN=$(git status --porcelain 2>/dev/null | head -c1)
  [[ -n "$PORCELAIN" ]] && DIRTY="*"
fi

# Active phase from PLAN.md (first non-completed phase)
PHASE=""
if [[ -f todo/PLAN.md ]]; then
  PHASE=$(grep -E "^### Phase " todo/PLAN.md 2>/dev/null \
    | grep -v "(COMPLETED)" \
    | head -n1 \
    | sed 's/^### //; s/ —.*//' \
    | tr -d '\n')
fi

# Bitácora freshness — flag if there's uncommitted work + no recent bitácora
BITACORA_FLAG=""
TODAY=$(date +%Y-%m-%d 2>/dev/null)
if [[ -n "$BRANCH" && -n "$TODAY" ]]; then
  if [[ ! -f "todo/bitacora-${TODAY}.md" ]] && [[ -n "$PORCELAIN" ]]; then
    BITACORA_FLAG=" | bitácora pendiente"
  fi
fi

# Compose
PARTS=""
[[ -n "$BRANCH" ]] && PARTS="${BRANCH}${DIRTY}"
[[ -n "$PHASE" ]]  && PARTS="${PARTS} | ${PHASE}"
PARTS="${PARTS}${BITACORA_FLAG}"

# Default if nothing
[[ -z "$PARTS" ]] && PARTS="(no git)"

printf '%s\n' "$PARTS"
