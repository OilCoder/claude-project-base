#!/usr/bin/env bash
# Native adapter from the /adw skill to the external Builder.
set -euo pipefail

phase=${1:?usage: dispatch-builder.sh <phase-number> [local-model]}
local_model=${2:-${ADW_LOCAL_MODEL:-}}
project=${CLAUDE_PROJECT_DIR:-$PWD}
skill_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
dispatch_dir="$project/adw/dispatch"
briefing="$dispatch_dir/phase-${phase}.md"
allowed="$dispatch_dir/phase-${phase}.files"
gate="$project/adw/gates/phase-${phase}.sh"

for required in "$briefing" "$allowed" "$gate"; do
    [[ -f "$required" ]] || { printf 'Protocol error: missing %s\n' "$required" >&2; exit 2; }
done

tmp_contract=$(mktemp -d "${TMPDIR:-/tmp}/adw-contract-${phase}.XXXXXX")
tmp_results=$(mktemp -d "${TMPDIR:-/tmp}/adw-results-${phase}.XXXXXX")
cleanup() { rm -rf "$tmp_contract" "$tmp_results"; }
trap cleanup EXIT

# Codex CLI reads AGENTS.md from the workdir root. Without it the external
# builders never see the quality rules (ladder, prohibitions, closeout).
# Materialize + seal it once per project so the clean-worktree check holds.
rules="$skill_dir/AGENTS.md"
if [[ -f "$rules" && ! -f "$project/AGENTS.md" ]]; then
    cp "$rules" "$project/AGENTS.md"
    git -C "$project" add AGENTS.md
    git -C "$project" -c user.name='adw-hybrid dispatcher' -c user.email='adw-hybrid@local'         commit -m "chore: seal builder rules (AGENTS.md)" >/dev/null
fi

cp "$briefing" "$tmp_contract/spec.md"
cp "$allowed" "$tmp_contract/allowed-files.txt"
cp "$gate" "$tmp_contract/gate.sh"
chmod +x "$tmp_contract/gate.sh"

# No silent tier skipping (user policy 2026-08-20): a missing local model is
# an error, not an implicit jump to the cloud tier. ADW_SKIP_LOCAL=1 remains
# available as an explicit engineer decision.
skip_local=${ADW_SKIP_LOCAL:-0}
if [[ -z "$local_model" && "$skip_local" != 1 ]]; then
    printf 'Missing local model. Set ADW_LOCAL_MODEL, or ADW_SKIP_LOCAL=1 as an explicit decision.\n' >&2
    exit 2
fi

set +e
ADW_RESULTS_DIR="$tmp_results" ADW_LOCAL_MODEL="$local_model" ADW_SKIP_LOCAL="$skip_local" \
    ADW_ENGINE_MODE="${ADW_ENGINE_MODE:-ladder}" \
    "$skill_dir/scripts/run-builder.sh" --workdir "$project" --contract "$tmp_contract"
rc=$?
set -e

durable="$project/.claude/adw-runs/builders/phase-${phase}/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$durable"
cp -a "$tmp_results/." "$durable/"
printf 'builder_artifacts=%s\n' "$durable"
exit "$rc"
