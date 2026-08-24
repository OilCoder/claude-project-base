#!/usr/bin/env bash
# Reproducible wave E2E with fake Codex, Ollama, and GPU commands.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/adw-wave-e2e.XXXXXX")
cleanup() {
    local rc=$?
    rm -rf "$TEST_ROOT"
    exit "$rc"
}
trap cleanup EXIT

PROJECT="$TEST_ROOT/project"
FAKE_BIN="$TEST_ROOT/bin"
PROFILE="$TEST_ROOT/ollama-launch.config.toml"
mkdir -p "$PROJECT" "$FAKE_BIN"
cp -a "$SCRIPT_DIR/../../.." "$PROJECT/.claude"
printf 'profile fixture\n' >"$PROFILE"

cat >"$FAKE_BIN/nvidia-smi" <<'SH'
#!/usr/bin/env bash
printf '16376, 14000\n'
SH
cat >"$FAKE_BIN/ollama" <<'SH'
#!/usr/bin/env bash
printf 'NAME ID SIZE PROCESSOR UNTIL\n'
SH
cat >"$FAKE_BIN/curl" <<'SH'
#!/usr/bin/env bash
printf '{"models":[{"name":"fake-local:latest"}]}\n'
SH
cat >"$FAKE_BIN/codex" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
workdir=""; output=""; prompt=""; local_engine=false
while (($#)); do
    case "$1" in
        --cd) workdir=$2; shift 2 ;;
        -o) output=$2; shift 2 ;;
        --profile) local_engine=true; shift 2 ;;
        *) prompt=$1; shift ;;
    esac
done
target=$(printf '%s\n' "$prompt" | sed -n 's/^TARGET=//p' | head -n 1)
[[ -n "$target" ]]
if [[ "$local_engine" == true ]]; then
    printf 'bad\n' >"$workdir/$target"
else
    printf 'good\n' >"$workdir/$target"
fi
printf 'fake message\n' >"$output"
printf '{"type":"turn.completed","usage":{"input_tokens":20,"output_tokens":7}}\n'
SH
chmod +x "$FAKE_BIN"/*

git -C "$PROJECT" init -q
git -C "$PROJECT" config user.name 'ADW Wave E2E'
git -C "$PROJECT" config user.email 'adw-wave-e2e@local'
git -C "$PROJECT" checkout -q -b adw/example
printf 'base\n' >"$PROJECT/one.txt"
printf 'base\n' >"$PROJECT/two.txt"
mkdir -p "$PROJECT/adw/dispatch" "$PROJECT/adw/gates" "$PROJECT/adw/waves"
for number in 1 2; do
    target=one.txt; [[ "$number" == 2 ]] && target=two.txt
    printf 'TARGET=%s\nChange only %s so it contains good.\n' "$target" "$target" \
        >"$PROJECT/adw/dispatch/phase-${number}.md"
    printf '%s\n' "$target" >"$PROJECT/adw/dispatch/phase-${number}.files"
    printf '#!/usr/bin/env bash\nset -euo pipefail\n[[ "$(cat %s)" == good ]]\n' "$target" \
        >"$PROJECT/adw/gates/phase-${number}.sh"
    chmod +x "$PROJECT/adw/gates/phase-${number}.sh"
done
git -C "$PROJECT" add .
git -C "$PROJECT" commit -q -m 'wave base'
base=$(git -C "$PROJECT" rev-parse HEAD)

cat >"$PROJECT/adw/waves/wave-1.json" <<EOF
{
  "schema_version": 1,
  "wave_id": "wave-1",
  "cycle_branch": "adw/example",
  "integration_head": "$base",
  "integrated_phases": [],
  "phases": [
    {"phase_id":"phase-1","depends_on":[],"owned_files":["one.txt"],"base_commit":"$base","gate_commit":"$base","worktree":".claude/worktrees/wave-1-phase-1","branch":"adw-wave/example/wave-1-phase-1","loop_backs":0},
    {"phase_id":"phase-2","risk":"medium","depends_on":[],"owned_files":["two.txt"],"base_commit":"$base","gate_commit":"$base","worktree":".claude/worktrees/wave-1-phase-2","branch":"adw-wave/example/wave-1-phase-2","loop_backs":0}
  ]
}
EOF

MANAGER="$PROJECT/.claude/skills/adw/scripts/wave-manager.py"
PATH="$FAKE_BIN:$PATH" ADW_LOCAL_MODEL=fake-local:latest ADW_LOCAL_PROFILE_FILE="$PROFILE" \
    python3 "$MANAGER" validate "$PROJECT/adw/waves/wave-1.json" --project "$PROJECT"
PATH="$FAKE_BIN:$PATH" ADW_LOCAL_MODEL=fake-local:latest ADW_LOCAL_PROFILE_FILE="$PROFILE" \
    python3 "$MANAGER" prepare "$PROJECT/adw/waves/wave-1.json" --project "$PROJECT"
PATH="$FAKE_BIN:$PATH" ADW_LOCAL_MODEL=fake-local:latest ADW_LOCAL_PROFILE_FILE="$PROFILE" \
    python3 "$MANAGER" build "$PROJECT/adw/waves/wave-1.json" --project "$PROJECT"

python3 - "$PROJECT/adw/waves/wave-1.json" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1], encoding="utf-8"))
assert manifest["status"] == "built"
assert [phase["engine"] for phase in manifest["phases"]] == ["cloud", "cloud"]
assert [phase["risk"] for phase in manifest["phases"]] == ["low", "medium"]
assert manifest["limits"] == {"local": 1, "cloud": 2, "claude": 0}
PY

for number in 1 2; do
    worktree="$PROJECT/.claude/worktrees/wave-1-phase-${number}"
    git -C "$worktree" add one.txt two.txt
    git -C "$worktree" commit -q -m "feat(phase-${number}): wave fixture"
done
python3 - "$PROJECT/adw/waves/wave-1.json" "$PROJECT" <<'PY'
import json, subprocess, sys
from pathlib import Path
path = Path(sys.argv[1])
project = Path(sys.argv[2])
manifest = json.loads(path.read_text())
for phase in manifest["phases"]:
    worktree = project / phase["worktree"]
    phase["verdict"] = "pass"
    phase["verified_commit"] = subprocess.check_output(
        ["git", "-C", str(worktree), "rev-parse", "HEAD"], text=True
    ).strip()
path.write_text(json.dumps(manifest, indent=2) + "\n")
PY

PATH="$FAKE_BIN:$PATH" python3 "$MANAGER" integrate \
    "$PROJECT/adw/waves/wave-1.json" --project "$PROJECT"
[[ "$(cat "$PROJECT/one.txt")" == good ]]
[[ "$(cat "$PROJECT/two.txt")" == good ]]
python3 - "$PROJECT/adw/waves/wave-1.json" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1], encoding="utf-8"))
assert manifest["status"] == "passed"
assert all(phase["integration_status"] == "passed" for phase in manifest["phases"])
PY

printf 'ADW wave manager E2E: PASS (low-risk local ladder; medium-risk cloud; serial integration)\n'
