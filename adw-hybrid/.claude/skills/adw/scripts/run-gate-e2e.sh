#!/usr/bin/env bash
# Offline gate-author E2E with a fake Codex executable.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DISPATCHER="$SCRIPT_DIR/dispatch-gate-codex.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/adw-gate-e2e.XXXXXX")
cleanup() {
    local rc=$?
    rm -rf "$TEST_ROOT"
    exit "$rc"
}
trap cleanup EXIT

project="$TEST_ROOT/project"
fake_bin="$TEST_ROOT/bin"
mkdir -p "$project/adw/dispatch" "$fake_bin"
git -C "$project" init -q
git -C "$project" config user.name 'ADW Gate E2E'
git -C "$project" config user.email 'adw-gate-e2e@local'
printf 'base\n' >"$project/app.txt"
git -C "$project" add app.txt
git -C "$project" commit -q -m initial
printf 'Change app.txt to good.\n' >"$project/adw/dispatch/phase-1.md"
printf 'app.txt\n' >"$project/adw/dispatch/phase-1.files"

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
mkdir -p "$workdir/adw/gates"
cat >"$workdir/adw/gates/phase-1.sh" <<'GATE'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$(cat app.txt)" != good ]]; then
    printf 'FAIL: expected app.txt=good\n'
    exit 1
fi
printf 'GATE phase-1: PASS\n'
GATE
printf 'gate authored\n' >"$output"
printf '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}\n'
SH
chmod +x "$fake_bin/codex"

PATH="$fake_bin:$PATH" CLAUDE_PROJECT_DIR="$project" \
    bash "$DISPATCHER" 1 >/dev/null
test -x "$project/adw/gates/phase-1.sh"
summary=$(find "$project/.claude/adw-runs/gates" -name attempt-summary.txt -print -quit)
grep -q 'verdict=PASS' "$summary"
[[ "$(cat "$project/app.txt")" == base ]]
printf 'ADW gate Codex dispatcher E2E: PASS (fake executable; no model/network)\n'
