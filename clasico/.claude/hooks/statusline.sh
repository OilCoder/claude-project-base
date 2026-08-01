#!/usr/bin/env bash
# Statusline hook: renders the prompt status line on every Claude turn.
# Output format: <branch><dirty> | <active phase> | <bitácora flag> | ctx NN%
#
# Robustness:
#   - 2s overall timeout (must be fast — runs on every turn)
#   - Logs failures to .claude/hooks.log
#   - On error or timeout, prints "(no git)" so the status line never breaks UX
#   - Context %: probed defensively from the stdin JSON (fields vary by version);
#     silently omitted when absent. ⚠ past 60% — the practical "dumb zone" where
#     long-context degradation starts (close the phase: /compact <focus> or new session).

set -u

# Claude Code pipes a JSON payload via stdin (model, workspace, context metrics).
STDIN_JSON=""
if [ ! -t 0 ]; then
  STDIN_JSON=$(timeout 1 cat 2>/dev/null || true)
fi

CTX=""
if [[ -n "$STDIN_JSON" ]] && command -v jq >/dev/null 2>&1; then
  CTX=$(printf '%s' "$STDIN_JSON" | jq -r '
    ( .context_window.used_percentage? // .context_usage.percentage? //
      .context.used_percent? //
      ( if ((.context_window.used_tokens? // null) != null)
           and ((.context_window.context_size? // 0) > 0)
        then (.context_window.used_tokens / .context_window.context_size * 100)
        else null end ) )
    | if . == null then empty else (. | floor | tostring) end
  ' 2>/dev/null || true)
fi
CTX_PART=""
if [[ "$CTX" =~ ^[0-9]+$ ]]; then
  if (( CTX >= 60 )); then CTX_PART=" | ctx ${CTX}%⚠"; else CTX_PART=" | ctx ${CTX}%"; fi
fi

LOG="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks.log"
HOOK_NAME="statusline"

log_err() {
  mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
  printf '[%s] %s: %s\n' "$(date -u +%FT%TZ 2>/dev/null || echo unknown)" "$HOOK_NAME" "$1" >> "$LOG" 2>/dev/null || true
}

trap 'log_err "unexpected error at line $LINENO"; printf "(no git)\n"; exit 0' ERR

OUT=$(
  timeout 2 bash -c '
    BRANCH=$(git branch --show-current 2>/dev/null || echo "")

    DIRTY=""
    PORCELAIN=""
    if [[ -n "$BRANCH" ]]; then
      PORCELAIN=$(git status --porcelain 2>/dev/null | head -c1)
      [[ -n "$PORCELAIN" ]] && DIRTY="*"
    fi

    PHASE=""
    if [[ -f planning/PLAN.md ]]; then
      PHASE=$(grep -E "^### Phase " planning/PLAN.md 2>/dev/null | grep -v "(COMPLETED)" | head -n1 | sed "s/^### //; s/ —.*//" | tr -d "\n")
    fi

    BITACORA_FLAG=""
    TODAY=$(date +%Y-%m-%d 2>/dev/null)
    if [[ -n "$BRANCH" && -n "$TODAY" ]]; then
      if [[ ! -f "planning/bitacora/${TODAY}.md" && -n "$PORCELAIN" ]]; then
        BITACORA_FLAG=" | bitácora pendiente"
      fi
    fi

    PARTS=""
    [[ -n "$BRANCH" ]] && PARTS="${BRANCH}${DIRTY}"
    [[ -n "$PHASE" ]]  && PARTS="${PARTS} | ${PHASE}"
    PARTS="${PARTS}${BITACORA_FLAG}"

    [[ -z "$PARTS" ]] && PARTS="(no git)"

    printf "%s\n" "$PARTS"
  ' 2>/dev/null
) || {
  log_err "main subshell failed or timed out"
  printf '(no git)%s\n' "$CTX_PART"
  exit 0
}

printf '%s%s\n' "${OUT:-(no git)}" "$CTX_PART"
exit 0
