# Reuse and new design

## Reused from `noloop/`

- The `fixture-project` design, used during isolated validation and removed
  from the final delivery.
- Terse briefings from the caveman protocol.
- Executable gates whose initial state is red.
- Change, scope, and verification rules, distilled into `AGENTS.md`.

The original under `noloop/` remains unmodified and is not a runtime
dependency.

## New design

- Preflight for Ollama, models, GPU, and tool calling.
- Model × contract × repetition matrix (benchmark postponed; see `SPEC.md`).
- Independent contracts and patch-seeded bug.
- JSONL capture and normalized metrics schema.
- Local/cloud comparison and eligibility criteria.
- Ladder design and runner, implemented as `/adw` skill scripts.
- Native Claude Code integration under `.claude/`: the `/adw` skill keeps
  orchestrating agents and hooks; the external adapter replaces only the
  Builder.
- Mandatory local tier and no-silent-escalation policy (user decision
  2026-08-20).
- Bounded DAG wave management with dynamic GPU grants, isolated phase
  worktrees, concurrent cloud escalation, durable loop-back state, and serial
  gated integration.
