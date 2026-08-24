#!/usr/bin/env bash
# Offline goal-dispatch E2E with a fake Codex executable.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DISPATCHER="$SCRIPT_DIR/dispatch-goal-codex.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/adw-goal-e2e.XXXXXX")
cleanup() {
    local rc=$?
    rm -rf "$TEST_ROOT"
    exit "$rc"
}
trap cleanup EXIT

project="$TEST_ROOT/project"
fake_bin="$TEST_ROOT/bin"
mkdir -p "$project" "$fake_bin"
git -C "$project" init -q
git -C "$project" config user.name 'ADW Goal E2E'
git -C "$project" config user.email 'adw-goal-e2e@local'
printf 'repository evidence\n' >"$project/README.md"
git -C "$project" add README.md
git -C "$project" commit -q -m initial
printf 'Define a measurable goal.\n' >"$TEST_ROOT/request.txt"

cat >"$fake_bin/codex" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
workdir=""; output=""
while (($#)); do
    case "$1" in
        --cd) workdir=$2; shift 2 ;;
        -o) output=$2; shift 2 ;;
        *) shift ;;
    esac
done
mkdir -p "$workdir/adw"
printf '# Goal\n\nObjective and measurable done-when.\n' >"$workdir/adw/goal.md"
printf 'goal drafted\n' >"$output"
printf '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}\n'
SH
chmod +x "$fake_bin/codex"

PATH="$fake_bin:$PATH" CLAUDE_PROJECT_DIR="$project" \
    bash "$DISPATCHER" "$TEST_ROOT/request.txt" >/dev/null

grep -q '^# Goal' "$project/adw/goal.md"
summary=$(find "$project/.claude/adw-runs/goals" -name attempt-summary.txt -print -quit)
grep -q 'verdict=PASS' "$summary"
grep -q '^words=' "$summary"
[[ -z "$(git -C "$project" status --porcelain -- README.md)" ]]
printf 'ADW goal Codex dispatcher E2E: PASS (fake executable; no model/network)\n'
