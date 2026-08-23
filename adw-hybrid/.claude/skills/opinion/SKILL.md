---
name: opinion
description: Runs a bounded multi-perspective strategy debate and returns an orchestrator synthesis. Use for /opinion or when a decision benefits from competing evidence-based positions.
---

# Opinion workflow

1. Define the decision, constraints, and evidence boundary.
2. Dispatch two `opinion` agents in parallel with distinct useful angles.
3. Send each the other's position for one rebuttal round.
4. Run at most one additional round if material disagreement remains.
5. Reconcile the decision yourself. State evidence, tradeoffs, rejected option,
   and what would change the decision.

Debate strategy, not disposable implementation detail. Keep every message terse.
