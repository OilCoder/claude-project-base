#!/usr/bin/env bash
# Stop hook: when Claude finishes its turn, check whether a checkpoint is due.
# A checkpoint is due if there are uncommitted changes OR commits made since
# the latest bitácora entry.
#
# Suggests /checkpoint via additionalContext rather than blocking.

set -e

# Skip if not a git repo
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

DIRTY=$(git status --porcelain 2>/dev/null || true)
LATEST_BITACORA=$(ls -1t todo/bitacora-*.md 2>/dev/null | head -n1 || true)

NEEDS_CHECKPOINT=0
REASONS=""

if [[ -n "$DIRTY" ]]; then
  NEEDS_CHECKPOINT=1
  REASONS="${REASONS}- uncommitted changes in working tree\n"
fi

if [[ -n "$LATEST_BITACORA" ]]; then
  # commits since the bitácora was last touched
  BITACORA_MTIME=$(date -r "$LATEST_BITACORA" "+%s" 2>/dev/null || stat -f "%m" "$LATEST_BITACORA" 2>/dev/null || echo 0)
  if [[ "$BITACORA_MTIME" -gt 0 ]]; then
    SINCE=$(date -d "@$BITACORA_MTIME" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -r "$BITACORA_MTIME" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "")
    if [[ -n "$SINCE" ]]; then
      NEW_COMMITS=$(git log --since="$SINCE" --oneline 2>/dev/null | wc -l | tr -d ' ')
      if [[ "$NEW_COMMITS" -gt 0 ]]; then
        NEEDS_CHECKPOINT=1
        REASONS="${REASONS}- ${NEW_COMMITS} commit(s) since last bitácora\n"
      fi
    fi
  fi
fi

[[ "$NEEDS_CHECKPOINT" -eq 0 ]] && exit 0

MSG="Checkpoint suggestion: this session has unrecorded work.\n${REASONS}Run /checkpoint to update plan, document, log session, and commit."

printf '{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"%s"}}' \
  "$(printf '%b' "$MSG" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')"

exit 0
