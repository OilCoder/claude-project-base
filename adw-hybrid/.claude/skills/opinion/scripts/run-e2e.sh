#!/usr/bin/env bash
# Offline opinion-dispatch E2E with a fake Codex executable.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DISPATCHER="$SCRIPT_DIR/dispatch-opinion-codex.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/adw-opinion-e2e.XXXXXX")
cleanup() {
    local rc=$?
    rm -rf "$TEST_ROOT"
    exit "$rc"
}
trap cleanup EXIT

project="$TEST_ROOT/project"
fake_bin="$TEST_ROOT/bin"
mkdir -p "$project" "$fake_bin"
printf 'evidence\n' >"$project/README.md"
printf 'Decision: use the smallest verifiable phase.\n' >"$TEST_ROOT/request.txt"

cat >"$fake_bin/codex" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
output=""
while (($#)); do
    case "$1" in
        -o) output=$2; shift 2 ;;
        *) shift ;;
    esac
done
printf 'VERDICT: SUPPORT\nEvidence: repository is small.\n' >"$output"
printf '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}\n'
SH
chmod +x "$fake_bin/codex"

before=$(sha256sum "$project/README.md")
PATH="$fake_bin:$PATH" CLAUDE_PROJECT_DIR="$project" \
    bash "$DISPATCHER" "$TEST_ROOT/request.txt" >/dev/null
after=$(sha256sum "$project/README.md")
[[ "$before" == "$after" ]]
summary=$(find "$project/.claude/adw-runs/opinions" -name attempt-summary.txt -print -quit)
grep -q 'verdict=PASS' "$summary"
grep -q 'VERDICT: SUPPORT' "${summary%/*}/opinion.txt"
printf 'ADW opinion Codex dispatcher E2E: PASS (fake executable; no model/network)\n'
