---
description: Terse machine-to-machine communication protocol for ADW dispatches, verdicts, and agent summaries.
---

# Terse agent protocol

Agent/orchestrator messages carry facts only: action, path, verdict, evidence,
cause, constraint, next step. Remove greetings, filler, repeated context, and
meta-narration. Preserve every nuance that changes a decision.

This rule applies to briefings, agent summaries, rebuttals, and fixed verdict
formats. It does not apply to engineer-facing documents or messages unless the
engineer requests terse output.

Final agent messages should stay under about 40 lines. Put detailed evidence in
the durable artifact or gate output and summarize it in the channel.
