#!/usr/bin/env bash
# Author and negative-test one phase gate with Codex in an isolated worktree.
set -euo pipefail

phase=${1:?usage: dispatch-gate-codex.sh <phase-number>}
project=${CLAUDE_PROJECT_DIR:-$PWD}
model=${ADW_GATE_MODEL:-gpt-5.6-sol}
timeout_seconds=${ADW_GATE_AUTHOR_TIMEOUT_SECONDS:-900}
gate_timeout=${ADW_GATE_TIMEOUT_SECONDS:-300}
briefing="$project/adw/dispatch/phase-${phase}.md"
allowed="$project/adw/dispatch/phase-${phase}.files"

[[ "$phase" =~ ^[1-9][0-9]*$ ]] || { printf 'Invalid phase number: %s\n' "$phase" >&2; exit 2; }
for required in "$briefing" "$allowed"; do
    [[ -f "$required" ]] || { printf 'Missing phase artifact: %s\n' "$required" >&2; exit 2; }
done
command -v codex >/dev/null || { printf 'Missing codex CLI\n' >&2; exit 2; }
git -C "$project" rev-parse --is-inside-work-tree >/dev/null

run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
artifacts="$project/.claude/adw-runs/gates/phase-${phase}/$run_id"
worktree=$(mktemp -d "${TMPDIR:-/tmp}/adw-gate-worktree.XXXXXX")
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
mkdir -p "$artifacts" "$worktree/adw/dispatch" "$worktree/adw/gates"
cp "$briefing" "$worktree/adw/dispatch/phase-${phase}.md"
cp "$allowed" "$worktree/adw/dispatch/phase-${phase}.files"

prompt=$(cat <<EOF
You are the validation-contract author for ADW phase $phase.
Read adw/dispatch/phase-${phase}.md and its exact allowlist. Write only
adw/gates/phase-${phase}.sh. Never edit production code, tests, the briefing, or
the allowlist.

The executable Bash gate must be deterministic, offline, dependency-neutral,
and normally no more than 150 lines. It runs with the repository root as cwd;
never derive the root from BASH_SOURCE. Check the full falsifiable done-when,
important boundaries, owned-file lint/format when applicable, and the relevant
test command. Print 'FAIL: <expectation versus observation>' for failures and a
clear PASS line on success. It must fail against the current pre-implementation
snapshot. Do not weaken existing project controls.
EOF
)

set +e
timeout "$timeout_seconds" codex exec -m "$model" --sandbox workspace-write \
    --cd "$worktree" --ephemeral --json -o "$artifacts/last-message.txt" \
    "$prompt" >"$artifacts/events.jsonl" 2>"$artifacts/codex-stderr.txt"
rc=$?
set -e
gate="$worktree/adw/gates/phase-${phase}.sh"

if ((rc != 0)) || [[ ! -s "$gate" ]]; then
    printf 'engine=codex-cloud\nmodel=%s\nverdict=FAIL\nnote=codex_rc_or_missing_gate:%s\n' \
        "$model" "$rc" >"$artifacts/attempt-summary.txt"
    printf 'Gate Codex run failed; artifacts=%s\n' "$artifacts" >&2
    exit 20
fi

chmod +x "$gate"
changed=$(git -C "$worktree" status --porcelain --untracked-files=all -- . \
    ':!.claude/adw-runs' ':!adw/dispatch')
outside=$(printf '%s\n' "$changed" | sed -E 's/^.. //' \
    | sed "/^adw\/gates\/phase-${phase}\.sh$/d;/^$/d")
if [[ -n "$outside" ]]; then
    printf 'engine=codex-cloud\nmodel=%s\nverdict=FAIL\nnote=out_of_scope\nchanged:\n%s\n' \
        "$model" "$changed" >"$artifacts/attempt-summary.txt"
    printf 'Gate Codex output was out of scope; artifacts=%s\n' "$artifacts" >&2
    exit 20
fi

set +e
(cd "$worktree" && timeout "$gate_timeout" bash "$gate") \
    >"$artifacts/gate-stdout.txt" 2>"$artifacts/gate-stderr.txt"
gate_rc=$?
set -e
if ((gate_rc == 0 || gate_rc == 124)); then
    note=gate_did_not_fail; [[ "$gate_rc" == 124 ]] && note=gate_timeout
    printf 'engine=codex-cloud\nmodel=%s\nverdict=FAIL\nnote=%s\n' \
        "$model" "$note" >"$artifacts/attempt-summary.txt"
    printf 'Gate negative test invalid (%s); artifacts=%s\n' "$note" "$artifacts" >&2
    exit 20
fi

mkdir -p "$project/adw/gates"
cp "$gate" "$artifacts/gate.sh"
cp "$gate" "$project/adw/gates/phase-${phase}.sh"
chmod +x "$project/adw/gates/phase-${phase}.sh"
printf 'engine=codex-cloud\nmodel=%s\nverdict=PASS\nnegative_gate_rc=%s\n' \
    "$model" "$gate_rc" >"$artifacts/attempt-summary.txt"
printf 'PASS engine=codex-cloud gate=adw/gates/phase-%s.sh artifacts=%s\n' \
    "$phase" "$artifacts"
