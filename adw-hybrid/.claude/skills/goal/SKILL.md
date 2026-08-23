---
name: goal
description: Builds and verifies an evidence-backed ADW goal before planning. Use for /goal or when the user asks to define measurable outcomes and done-when criteria.
---

# Goal workflow

1. Dispatch `researcher` with the engineer request and relevant project context.
2. Dispatch `verifier` on the resulting `adw/goal.md`.
3. On FAIL, send only the verifier's actionable corrections back to researcher.
4. Repeat at most three times; escalate unresolved factual or subjective choices
   to the user.
5. Present the verified objective, metrics, unknowns, and done-when for approval.

Keep the main context clean: consume summaries and the durable goal, not raw
research transcripts. Do not start ADW planning until the user approves.
