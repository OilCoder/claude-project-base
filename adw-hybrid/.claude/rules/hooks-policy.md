---
paths: [".claude/settings.json", ".claude/settings.local.json", ".claude/settings.template.json", ".claude/hooks/**"]
description: Hook safety and command-detection policy.
---

# Hook policy

Do not use heuristic settings matchers to classify dangerous shell text. Run a
hook on the relevant tool and perform literal validation inside the hook after
parsing `tool_input` with `jq`. Over-broad matchers produce false positives and
waste turns.

Use exit `2` with a concise stderr reason for blocking hooks. Keep deterministic
checks in scripts, not model instructions. Add new dangerous-command patterns to
`.claude/hooks/check-dangerous-bash.sh`; never bypass hooks or weaken gates.
