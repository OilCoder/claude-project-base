---
description: Durable-state and compaction discipline for the ADW orchestrator.
---

# Context discipline

Maintain `adw/state.md` as the orchestrator's working memory, about 60 lines:

- Goal and done-when.
- Current phase and loop-back count.
- Key decisions and rationale.
- Failed approaches and causes.
- Exact next action.
- Resume commands and paths.

Update it after reconciliation, phase closure, failed approaches, and context
warnings. At the context threshold, finish the current micro-step, update state,
and request directed compaction. In autonomous sessions, externalize everything
needed to resume and continue until automatic compaction.

After compaction, read `adw/state.md`, `adw/goal.md`, and the active plan phase
before any other action. Ask agents for conclusions rather than transcripts.
