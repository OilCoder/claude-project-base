#!/usr/bin/env bash
# Research and draft adw/goal.md with Codex cloud in an isolated worktree.
set -euo pipefail

request_file=${1:?usage: dispatch-goal-codex.sh <request-file>}
project=${CLAUDE_PROJECT_DIR:-$PWD}
model=${ADW_GOAL_MODEL:-gpt-5.6-sol}
timeout_seconds=${ADW_GOAL_TIMEOUT_SECONDS:-900}
max_words=${ADW_GOAL_MAX_WORDS:-3000}
max_lines=${ADW_GOAL_MAX_LINES:-400}

[[ -f "$request_file" ]] || { printf 'Goal request not found: %s\n' "$request_file" >&2; exit 2; }
[[ "$max_words" =~ ^[1-9][0-9]*$ && "$max_lines" =~ ^[1-9][0-9]*$ ]] \
    || { printf 'Goal size budgets must be positive integers\n' >&2; exit 2; }
command -v codex >/dev/null || { printf 'Missing codex CLI\n' >&2; exit 2; }
git -C "$project" rev-parse --is-inside-work-tree >/dev/null

run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
artifacts="$project/.claude/adw-runs/goals/$run_id"
worktree=$(mktemp -d "${TMPDIR:-/tmp}/adw-goal-worktree.XXXXXX")
worktree_added=false
cleanup() {
    if [[ "$worktree_added" == true ]]; then
        git -C "$project" worktree remove --force "$worktree" >/dev/null 2>&1 || true
    else
        rm -rf "$worktree"
    fi
}
trap cleanup EXIT

git -C "$project" worktree add --detach "$worktree" HEAD >/dev/null
worktree_added=true
mkdir -p "$artifacts" "$worktree/adw"
if [[ -f "$project/adw/goal.md" ]]; then
    cp "$project/adw/goal.md" "$worktree/adw/goal.md"
fi

prompt=$(cat <<EOF
You are the evidence researcher and goal author for an ADW cycle.

Engineer request:
$(cat "$request_file")

Research the committed repository and external primary sources only when they
are necessary. Write or replace adw/goal.md. Do not modify any other file.

The goal must contain: an outcome-oriented objective; verified findings with
path:line or URL citations; explicit unknowns and assumptions; success metrics
with indicator, target, and measurement method; falsifiable done-when; scope
boundaries; and material risks. Distinguish facts, inference, and unknowns.
Do not design implementation phases or production code. Keep the document
concise and evidence-backed.

Treat adw/goal.md as one canonical specification, never an append-only log.
Rewrite it as needed: incorporate binding decisions into their relevant
sections; remove superseded claims, repeated evidence, deliberation history,
and obsolete unknowns. Stay within $max_words words and $max_lines lines.
EOF
)

set +e
timeout "$timeout_seconds" codex exec -m "$model" --sandbox workspace-write \
    --cd "$worktree" --ephemeral --json -o "$artifacts/last-message.txt" \
    "$prompt" >"$artifacts/events.jsonl" 2>"$artifacts/codex-stderr.txt"
rc=$?
set -e

if ((rc != 0)); then
    printf 'engine=codex-cloud\nmodel=%s\nverdict=FAIL\nnote=codex_rc=%s\n' \
        "$model" "$rc" >"$artifacts/attempt-summary.txt"
    printf 'Goal Codex run failed (rc=%s); artifacts=%s\n' "$rc" "$artifacts" >&2
    exit 20
fi

changed=$(git -C "$worktree" status --porcelain --untracked-files=all -- . ':!.claude/adw-runs')
outside=$(printf '%s\n' "$changed" | sed -E 's/^.. //' | sed '/^adw\/goal\.md$/d;/^$/d')
if [[ -n "$outside" || ! -s "$worktree/adw/goal.md" ]]; then
    printf 'engine=codex-cloud\nmodel=%s\nverdict=FAIL\nnote=scope_or_output\nchanged:\n%s\n' \
        "$model" "$changed" >"$artifacts/attempt-summary.txt"
    printf 'Goal Codex output failed scope/content validation; artifacts=%s\n' "$artifacts" >&2
    exit 20
fi

word_count=$(wc -w <"$worktree/adw/goal.md")
line_count=$(wc -l <"$worktree/adw/goal.md")
if ((word_count > max_words || line_count > max_lines)); then
    printf 'engine=codex-cloud\nmodel=%s\nverdict=FAIL\nnote=size_budget\nwords=%s/%s\nlines=%s/%s\n' \
        "$model" "$word_count" "$max_words" "$line_count" "$max_lines" \
        >"$artifacts/attempt-summary.txt"
    cp "$worktree/adw/goal.md" "$artifacts/rejected-goal.md"
    printf 'Goal exceeds size budget (%s/%s words, %s/%s lines); artifacts=%s\n' \
        "$word_count" "$max_words" "$line_count" "$max_lines" "$artifacts" >&2
    exit 20
fi

cp "$worktree/adw/goal.md" "$artifacts/goal.md"
mkdir -p "$project/adw"
cp "$worktree/adw/goal.md" "$project/adw/goal.md"
printf 'engine=codex-cloud\nmodel=%s\nverdict=PASS\nchanged=adw/goal.md\nwords=%s\nlines=%s\n' \
    "$model" "$word_count" "$line_count" >"$artifacts/attempt-summary.txt"
printf 'PASS engine=codex-cloud goal=adw/goal.md artifacts=%s\n' "$artifacts"
