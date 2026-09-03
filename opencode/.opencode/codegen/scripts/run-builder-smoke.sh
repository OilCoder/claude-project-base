#!/usr/bin/env bash
set -euo pipefail

model=${1:?usage: run-builder-smoke.sh <provider/model>}
timeout_seconds=${CODEGEN_BUILDER_TIMEOUT_SECONDS:-900}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
system_root=$(cd -- "$script_dir/../../.." && pwd)
fixture="$system_root/tests/fixtures/builder-basic"
safe_model=${model//\//__}
safe_model=${safe_model//:/_}
run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
artifacts="$system_root/.opencode/codegen/runs/builder-smoke/$safe_model/$run_id"
workdir=$(mktemp -d "${TMPDIR:-/tmp}/opencode-builder-smoke.XXXXXX")

cleanup() {
  rm -rf -- "$workdir"
}
trap cleanup EXIT

for command in opencode git node python3 timeout; do
  command -v "$command" >/dev/null || {
    printf 'Missing required command: %s\n' "$command" >&2
    exit 2
  }
done
[[ -d "$fixture" ]] || { printf 'Missing fixture: %s\n' "$fixture" >&2; exit 2; }

cp -a "$fixture/." "$workdir/"
mkdir -p "$workdir/.opencode"
cp -a "$system_root/.opencode/agents" "$workdir/.opencode/agents"
cp -a "$system_root/.opencode/instructions" "$workdir/.opencode/instructions"
cp "$system_root/opencode.json" "$workdir/opencode.json"
cp "$system_root/.gitignore" "$workdir/.gitignore"

git -C "$workdir" init -q
git -C "$workdir" config user.name "OpenCode Builder Smoke"
git -C "$workdir" config user.email "builder-smoke@localhost"
git -C "$workdir" add .
git -C "$workdir" commit -q -m "test: seal builder smoke contract"

mkdir -p "$artifacts"
if (cd "$workdir" && bash "$fixture/.codegen-contract/gate.sh") \
  >"$artifacts/negative-gate.txt" 2>&1; then
  printf 'Smoke fixture is invalid: trusted gate passes before implementation.\n' >&2
  exit 2
fi

prompt='Execute the sealed contract at .codegen-contract/contract.json. Implement it now and finish with the requested concise status.'
start=$(date +%s)
set +e
(cd "$workdir" && timeout "$timeout_seconds" opencode run --format json \
  --model "$model" --agent builder "$prompt") \
  >"$artifacts/events.jsonl" 2>"$artifacts/opencode-stderr.txt"
opencode_rc=$?
set -e
duration=$(( $(date +%s) - start ))
node "$system_root/.opencode/codegen/lib/run-metrics.mjs" \
  "$artifacts/events.jsonl" >"$artifacts/metrics.json"

{
  git -C "$workdir" diff --name-only HEAD -- .
  git -C "$workdir" ls-files --others --exclude-standard
} | sed '/^[[:space:]]*$/d' | sort -u >"$artifacts/changed-files.txt"
git -C "$workdir" diff HEAD -- . >"$artifacts/candidate.diff"

set +e
python3 - "$workdir" "$artifacts/changed-files.txt" <<'PY'
import json
import sys
from pathlib import Path

workdir = Path(sys.argv[1])
changed_path = Path(sys.argv[2])
contract = json.loads((workdir / ".codegen-contract/contract.json").read_text())
allowed = set(contract["allowed_to_modify"])
changed = {line for line in changed_path.read_text().splitlines() if line}
outside = sorted(changed - allowed)
missing_change = not changed
if outside:
    print("OUT_OF_SCOPE: " + ", ".join(outside))
if missing_change:
    print("NO_CHANGES")
raise SystemExit(1 if outside or missing_change else 0)
PY
scope_rc=$?

git -C "$workdir" diff --quiet HEAD -- \
  .codegen-contract tests .opencode opencode.json .gitignore
integrity_rc=$?

(cd "$workdir" && timeout 300 bash "$fixture/.codegen-contract/gate.sh") \
  >"$artifacts/gate-stdout.txt" 2>"$artifacts/gate-stderr.txt"
gate_rc=$?
set -e

if [[ "$opencode_rc" -ne 0 ]]; then
  result=INFRA_ERROR
elif [[ "$scope_rc" -ne 0 || "$integrity_rc" -ne 0 || "$gate_rc" -ne 0 ]]; then
  result=FAIL
else
  result=PASS
fi

cat >"$artifacts/summary.txt" <<EOF
result=$result
model=$model
duration_s=$duration
opencode_rc=$opencode_rc
scope_rc=$scope_rc
integrity_rc=$integrity_rc
gate_rc=$gate_rc
metrics=$artifacts/metrics.json
artifacts=$artifacts
EOF

cat "$artifacts/summary.txt"
[[ "$result" == PASS ]]
