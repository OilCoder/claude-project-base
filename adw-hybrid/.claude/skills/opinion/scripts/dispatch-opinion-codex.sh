#!/usr/bin/env bash
# Challenge an ADW strategy with Codex cloud without granting repository writes.
set -euo pipefail

request_file=${1:?usage: dispatch-opinion-codex.sh <request-file>}
project=${CLAUDE_PROJECT_DIR:-$PWD}
model=${ADW_OPINION_MODEL:-gpt-5.6-sol}
timeout_seconds=${ADW_OPINION_TIMEOUT_SECONDS:-600}

[[ -f "$request_file" ]] || { printf 'Opinion request not found: %s\n' "$request_file" >&2; exit 2; }
command -v codex >/dev/null || { printf 'Missing codex CLI\n' >&2; exit 2; }

run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
artifacts="$project/.claude/adw-runs/opinions/$run_id"
mkdir -p "$artifacts"

prompt=$(cat <<EOF
You are a skeptical, read-only strategy critic.

Decision and initial position:
$(cat "$request_file")

Inspect only repository evidence needed to test the position. Do not edit any
file. Identify unsupported assumptions, hidden dependencies, unsafe
parallelism, cheaper alternatives, and the smallest useful first phase.
Return a concise response with: VERDICT (SUPPORT, REVISE, or REJECT), strongest
evidence, material risks, recommended correction, and what would falsify it.
Do not produce an implementation plan or code.
EOF
)

set +e
timeout "$timeout_seconds" codex exec -m "$model" --sandbox read-only \
    --cd "$project" --ephemeral --json -o "$artifacts/opinion.txt" \
    "$prompt" >"$artifacts/events.jsonl" 2>"$artifacts/codex-stderr.txt"
rc=$?
set -e

if ((rc != 0)) || [[ ! -s "$artifacts/opinion.txt" ]]; then
    printf 'engine=codex-cloud\nmodel=%s\nverdict=FAIL\nnote=codex_rc=%s\n' \
        "$model" "$rc" >"$artifacts/attempt-summary.txt"
    printf 'Opinion Codex run failed (rc=%s); artifacts=%s\n' "$rc" "$artifacts" >&2
    exit 20
fi

printf 'engine=codex-cloud\nmodel=%s\nverdict=PASS\nmode=read-only\n' \
    "$model" >"$artifacts/attempt-summary.txt"
printf 'PASS engine=codex-cloud opinion=%s artifacts=%s\n' \
    "$artifacts/opinion.txt" "$artifacts"
