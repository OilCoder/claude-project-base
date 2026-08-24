#!/usr/bin/env bash
# Deterministic pre-verdict check: integrity, scope, and the complete phase gate.
set -euo pipefail

phase=${1:?usage: check-candidate.sh <phase-number> <sealed-commit> [project]}
sealed_commit=${2:?usage: check-candidate.sh <phase-number> <sealed-commit> [project]}
project=${3:-${CLAUDE_PROJECT_DIR:-$PWD}}
gate_timeout=${ADW_GATE_TIMEOUT_SECONDS:-300}
gate="$project/adw/gates/phase-${phase}.sh"
allowed_file="$project/adw/dispatch/phase-${phase}.files"

[[ "$phase" =~ ^[1-9][0-9]*$ ]] || { printf 'Invalid phase number: %s\n' "$phase" >&2; exit 2; }
for required in "$gate" "$allowed_file"; do
    [[ -f "$required" ]] || { printf 'FAIL: missing phase artifact: %s\n' "$required"; exit 1; }
done
git -C "$project" cat-file -e "${sealed_commit}^{commit}" \
    || { printf 'FAIL: sealed commit does not exist: %s\n' "$sealed_commit"; exit 1; }

run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
artifacts="$project/.claude/adw-runs/checks/phase-${phase}/$run_id"
mkdir -p "$artifacts"

failures=0
if ! git -C "$project" diff --quiet "$sealed_commit" -- "adw/gates/phase-${phase}.sh"; then
    printf 'FAIL: sealed gate changed: adw/gates/phase-%s.sh\n' "$phase" \
        | tee -a "$artifacts/summary.txt"
    failures=$((failures + 1))
fi

mapfile -t allowed < <(sed -e 's/[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$allowed_file")
((${#allowed[@]} > 0)) || { printf 'FAIL: phase allowlist is empty\n' | tee -a "$artifacts/summary.txt"; failures=$((failures + 1)); }

changed=$(
    {
        git -C "$project" diff --name-only "$sealed_commit" -- . \
            ':!.claude/adw-runs' ':!.claude/worktrees' ':!adw/waves'
        git -C "$project" ls-files --others --exclude-standard -- . \
            ':!.claude/adw-runs' ':!.claude/worktrees' ':!adw/waves'
    } | sed '/^[[:space:]]*$/d' | sort -u
)
while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    match=false
    for permitted in "${allowed[@]}"; do
        [[ "$path" == "$permitted" ]] && match=true && break
    done
    if [[ "$match" == false ]]; then
        printf 'FAIL: changed file outside phase scope: %s\n' "$path" \
            | tee -a "$artifacts/summary.txt"
        failures=$((failures + 1))
    fi
done <<<"$changed"

if ((failures == 0)); then
    set +e
    (cd "$project" && PYTHONDONTWRITEBYTECODE=1 timeout "$gate_timeout" bash "$gate") \
        >"$artifacts/gate-stdout.txt" 2>"$artifacts/gate-stderr.txt"
    gate_rc=$?
    set -e
    if ((gate_rc != 0)); then
        note=gate_fail; [[ "$gate_rc" == 124 ]] && note=gate_timeout
        printf 'FAIL: phase gate returned %s (%s)\n' "$gate_rc" "$note" \
            | tee -a "$artifacts/summary.txt"
        failures=$((failures + 1))
    fi
fi

if ((failures != 0)); then
    printf 'verdict=FAIL\nphase=%s\nsealed_commit=%s\nchanged_files:\n%s\n' \
        "$phase" "$sealed_commit" "$changed" >>"$artifacts/summary.txt"
    printf 'candidate_check=FAIL artifacts=%s\n' "$artifacts"
    exit 1
fi

printf 'verdict=PASS\nphase=%s\nsealed_commit=%s\nchanged_files:\n%s\n' \
    "$phase" "$sealed_commit" "$changed" >"$artifacts/summary.txt"
printf 'candidate_check=PASS phase=%s artifacts=%s\n' "$phase" "$artifacts"
