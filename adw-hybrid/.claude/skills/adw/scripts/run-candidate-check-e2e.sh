#!/usr/bin/env bash
# Offline deterministic candidate-check E2E.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CHECKER="$SCRIPT_DIR/check-candidate.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/adw-candidate-e2e.XXXXXX")
cleanup() {
    local rc=$?
    rm -rf "$TEST_ROOT"
    exit "$rc"
}
trap cleanup EXIT

project="$TEST_ROOT/project"
mkdir -p "$project/adw/gates" "$project/adw/dispatch"
git -C "$project" init -q
git -C "$project" config user.name 'ADW Candidate E2E'
git -C "$project" config user.email 'adw-candidate-e2e@local'
printf 'base\n' >"$project/app.txt"
printf 'app.txt\n' >"$project/adw/dispatch/phase-1.files"
cat >"$project/adw/gates/phase-1.sh" <<'GATE'
#!/usr/bin/env bash
set -euo pipefail
[[ "$(cat app.txt)" == good ]]
GATE
chmod +x "$project/adw/gates/phase-1.sh"
git -C "$project" add .
git -C "$project" commit -q -m sealed
sealed=$(git -C "$project" rev-parse HEAD)

printf 'good\n' >"$project/app.txt"
bash "$CHECKER" 1 "$sealed" "$project" >/dev/null

printf 'bad scope\n' >"$project/extra.txt"
set +e
bash "$CHECKER" 1 "$sealed" "$project" >"$TEST_ROOT/failure.txt"
rc=$?
set -e
[[ "$rc" == 1 ]]
grep -q 'outside phase scope' "$TEST_ROOT/failure.txt"
printf 'ADW deterministic candidate check E2E: PASS\n'
