#!/usr/bin/env bash
# Enforce canonical ADW document budgets so goals/plans do not become journals.
set -euo pipefail

project=${CLAUDE_PROJECT_DIR:-$PWD}
goal_words=${ADW_GOAL_MAX_WORDS:-3000}
goal_lines=${ADW_GOAL_MAX_LINES:-400}
plan_words=${ADW_PLAN_MAX_WORDS:-3500}
plan_lines=${ADW_PLAN_MAX_LINES:-450}

for value in "$goal_words" "$goal_lines" "$plan_words" "$plan_lines"; do
    [[ "$value" =~ ^[1-9][0-9]*$ ]] \
        || { printf 'Document budgets must be positive integers\n' >&2; exit 2; }
done

check_document() {
    local path=$1 max_words=$2 max_lines=$3 words lines
    [[ -f "$path" ]] || { printf 'FAIL: required document missing: %s\n' "$path"; return 1; }
    words=$(wc -w <"$path")
    lines=$(wc -l <"$path")
    if ((words > max_words || lines > max_lines)); then
        printf 'FAIL: %s exceeds canonical budget: %s/%s words, %s/%s lines\n' \
            "$path" "$words" "$max_words" "$lines" "$max_lines"
        return 1
    fi
    printf 'PASS: %s: %s/%s words, %s/%s lines\n' \
        "$path" "$words" "$max_words" "$lines" "$max_lines"
}

status=0
if (($#)); then
    for requested in "$@"; do
        case "$requested" in
            adw/goal.md|"$project/adw/goal.md")
                check_document "$project/adw/goal.md" "$goal_words" "$goal_lines" || status=1
                ;;
            adw/plan.md|"$project/adw/plan.md")
                check_document "$project/adw/plan.md" "$plan_words" "$plan_lines" || status=1
                ;;
            *) printf 'Unknown budgeted document: %s\n' "$requested" >&2; exit 2 ;;
        esac
    done
else
    check_document "$project/adw/goal.md" "$goal_words" "$goal_lines" || status=1
    check_document "$project/adw/plan.md" "$plan_words" "$plan_lines" || status=1
fi
exit "$status"
