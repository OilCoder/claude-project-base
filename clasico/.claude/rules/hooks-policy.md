<!-- description: Hook authoring policy — never use the "if" field for dangerous-command detection -->

# Hooks Policy

## Never use the `if` field to block dangerous commands

`"if": "Bash(git reset --hard *)"` (or `rm -rf`, `force-push`) is **not a
literal grep on the command text** — it is Claude Code's internal fuzzy risk
heuristic. Confirmed in two independent field deployments: it over-fires on
benign multi-line bash — `for` loops, heredocs, pipes with multiple commands
(e.g. `for ts in "a" "b"; do echo "$ts"; done` blocked as if it were
`git reset --hard`). Measured false-positive rate: 13/13 in the tracked
cases across both sessions; zero genuinely destructive commands were ever
caught by it — the cost is pure friction from agents reformulating innocent
commands.

**Correct alternative**: literal detection inside the hook's own script, the
same pattern `.claude/hooks/check-dangerous-bash.sh` already uses — `case`/
`grep -qE` on `tool_input.command` parsed with `jq`. The hook always fires
(never gated behind an `if`) and the script itself decides, on exact text,
whether to block.

```bash
# bad — fuzzy "if" field
{ "if": "Bash(git reset --hard *)", "hooks": [...] }

# good — the script decides with literal grep/case
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
case "$cmd" in
  *"git reset --hard"*|*"rm -rf "*) echo "BLOCKED: ..." >&2; exit 2 ;;
esac
```

`.claude/settings.template.json` used to carry the `if` bug in its
`PreToolUse:Bash` block — it wasn't only a field-deployment mistake, it was
baked into the seed every new deployment copies. Fixed: the reference
implementation is `.claude/hooks/check-dangerous-bash.sh`, wired from
`settings.template.json` with no `if` field. Any new dangerous-command guard
goes there, never as a new `if` entry.
