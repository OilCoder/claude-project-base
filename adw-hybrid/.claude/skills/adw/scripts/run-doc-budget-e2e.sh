#!/usr/bin/env bash
# Offline document-budget E2E.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CHECKER="$SCRIPT_DIR/check-doc-budgets.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/adw-doc-budget-e2e.XXXXXX")
cleanup() {
    local rc=$?
    rm -rf "$TEST_ROOT"
    exit "$rc"
}
trap cleanup EXIT

mkdir -p "$TEST_ROOT/adw"
printf 'short goal\n' >"$TEST_ROOT/adw/goal.md"
printf 'short plan\n' >"$TEST_ROOT/adw/plan.md"
CLAUDE_PROJECT_DIR="$TEST_ROOT" ADW_GOAL_MAX_WORDS=2 ADW_GOAL_MAX_LINES=2 \
    ADW_PLAN_MAX_WORDS=2 ADW_PLAN_MAX_LINES=2 bash "$CHECKER" >/dev/null

printf 'one two three\n' >"$TEST_ROOT/adw/plan.md"
set +e
CLAUDE_PROJECT_DIR="$TEST_ROOT" ADW_PLAN_MAX_WORDS=2 bash "$CHECKER" adw/plan.md \
    >"$TEST_ROOT/failure.txt"
rc=$?
set -e
[[ "$rc" == 1 ]]
grep -q 'exceeds canonical budget' "$TEST_ROOT/failure.txt"
printf 'ADW document budget E2E: PASS\n'
