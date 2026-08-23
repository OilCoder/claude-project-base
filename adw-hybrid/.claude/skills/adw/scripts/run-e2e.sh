#!/usr/bin/env bash
# Reproducible runner E2E. Uses fake codex/curl executables; no model or network.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
RUNNER="$SCRIPT_DIR/run-builder.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/adw-hybrid-e2e.XXXXXX")
cleanup() {
    local rc=$?
    rm -rf "$TEST_ROOT"
    exit "$rc"
}
trap cleanup EXIT

FAKE_BIN="$TEST_ROOT/bin"
CONTRACT="$TEST_ROOT/contract"
mkdir -p "$FAKE_BIN" "$CONTRACT"

cat >"$FAKE_BIN/codex" <<'SH'
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
if [[ "${FAKE_CODEX_RESULT:-pass}" == pass ]]; then
    printf 'good\n' >"$workdir/app.txt"
else
    printf 'bad\n' >"$workdir/app.txt"
    printf 'untracked cloud evidence\n' >"$workdir/new-file.txt"
fi
printf 'fake final message\n' >"$output"
printf '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}\n'
SH

cat >"$FAKE_BIN/curl" <<'SH'
#!/usr/bin/env bash
# Simulate unavailable local infrastructure so the runner must record SKIP.
exit 22
SH
chmod +x "$FAKE_BIN/codex" "$FAKE_BIN/curl"

cat >"$CONTRACT/spec.md" <<'EOF'
Change only app.txt so it contains exactly: good
EOF
printf 'app.txt\n' >"$CONTRACT/allowed-files.txt"
cat >"$CONTRACT/gate.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$(cat app.txt)" == good ]]
SH
chmod +x "$CONTRACT/gate.sh"

new_project() {
    local project=$1
    mkdir -p "$project"
    git -C "$project" init -q
    git -C "$project" config user.name 'ADW E2E'
    git -C "$project" config user.email 'adw-e2e@local'
    printf 'base\n' >"$project/app.txt"
    git -C "$project" add app.txt
    git -C "$project" commit -q -m 'initial'
}

# Case 1: cloud candidate passes, with normalized usage and clean scope metric.
project_pass="$TEST_ROOT/project-pass"
results_pass="$TEST_ROOT/results-pass"
new_project "$project_pass"
PATH="$FAKE_BIN:$PATH" FAKE_CODEX_RESULT=pass ADW_SKIP_LOCAL=1 \
    ADW_RESULTS_DIR="$results_pass" "$RUNNER" \
    --workdir "$project_pass" --contract "$CONTRACT" >/dev/null

python3 - "$results_pass/metrics.jsonl" <<'PY'
import json
import sys

rows = [json.loads(line) for line in open(sys.argv[1], encoding="utf-8")]
assert len(rows) == 1
assert rows[0]["engine"] == "cloud" and rows[0]["gate"] == "PASS"
assert rows[0]["touched_files"] == ["app.txt"]
assert rows[0]["out_of_scope"] is False
assert (rows[0]["tokens_in"], rows[0]["tokens_out"]) == (10, 5)
PY

# Case 2: local preflight failure stops the run (no silent tier skipping).
project_skip="$TEST_ROOT/project-skip"
results_skip="$TEST_ROOT/results-skip"
new_project "$project_skip"
set +e
PATH="$FAKE_BIN:$PATH" FAKE_CODEX_RESULT=pass ADW_SKIP_LOCAL=0 \
    ADW_LOCAL_MODEL=missing:model ADW_RESULTS_DIR="$results_skip" "$RUNNER" \
    --workdir "$project_skip" --contract "$CONTRACT" >/dev/null 2>/dev/null
skip_rc=$?
set -e
[[ "$skip_rc" == 2 ]]
[[ -z "$(git -C "$project_skip" status --porcelain)" ]]

python3 - "$results_skip/metrics.jsonl" <<'PY'
import json
import sys

rows = [json.loads(line) for line in open(sys.argv[1], encoding="utf-8")]
assert [row["gate"] for row in rows] == ["SKIP"]
assert rows[0]["engine"] == "local" and rows[0]["notes"] == "preflight_infra"
PY

# Case 3: failed cloud candidate is archived completely, then worktree resets.
project_fail="$TEST_ROOT/project-fail"
results_fail="$TEST_ROOT/results-fail"
new_project "$project_fail"
set +e
PATH="$FAKE_BIN:$PATH" FAKE_CODEX_RESULT=fail ADW_SKIP_LOCAL=1 \
    ADW_RESULTS_DIR="$results_fail" "$RUNNER" \
    --workdir "$project_fail" --contract "$CONTRACT" >/dev/null 2>/dev/null
fail_rc=$?
set -e
[[ "$fail_rc" == 20 ]]
[[ -z "$(git -C "$project_fail" status --porcelain)" ]]
run_dir=$(find "$results_fail" -mindepth 1 -maxdepth 1 -type d | head -n 1)
grep -q 'bad' "$run_dir/cloud-final.diff"
grep -q '^new-file.txt$' "$run_dir/cloud-final.files"
tar -tf "$run_dir/cloud-final-untracked.tar" >"$TEST_ROOT/cloud-tar-files.txt"
grep -q '^new-file.txt$' "$TEST_ROOT/cloud-tar-files.txt"

printf 'ADW hybrid runner E2E: PASS (fake executables; no model/network)\n'
bash "$SCRIPT_DIR/run-wave-e2e.sh"
