---
name: adw
description: Orchestrates the complete hybrid ADW cycle: strategy, plan, validation-first gates, local/Codex/Claude Builder ladder, verdicts, and engineer review. Use for /adw or when the user asks to run the ADW workflow.
---

# Hybrid ADW cycle

You are the main Claude Code orchestrator. Delegate work and consume durable
artifacts; do not implement production code yourself.

## Orchestrator rails

- Do not inspect source files in detail or edit production code.
- Agents communicate through files and return concise summaries to you.
- Report each dispatch boundary to the user.
- Machine-facing artifacts and messages are English by default.
- Human-facing language follows the user's language when explicitly requested.

## 1. Planning

1. Dispatch two `opinion` agents in parallel with the engineer prompt and goal.
2. Run at most two cross-rebuttal rounds; stop early on convergence.
3. Reconcile the strategy yourself and record the decision and rationale.
4. Dispatch `planner` with the prompt, goal, and reconciled strategy.
5. Present strategy, phases, done-when conditions, dependencies, and risks to
   the user. Wait for approval.
6. On approval, create `adw/<short-slug>` from the current branch and record the
   base branch. Replanning reuses the reconciled strategy unless it was invalid.

## 2. Phase execution

Every Builder briefing is self-contained and terse. It includes phase scope,
allowed files, done-when, gate path, gate commit, and previous verdict.

### Gate

1. Dispatch `test-agent` in GATE mode. It creates `adw/gates/phase-N.sh` and
   proves that it fails before implementation.
2. Create:
   - `adw/dispatch/phase-N.md`: self-contained Builder briefing.
   - `adw/dispatch/phase-N.files`: one allowed path per line; include
     `adw/log.md` only when the Builder must update it.
3. Commit gate and dispatch artifacts as `chore(phase-N): gate`. The external
   adapter requires a clean worktree.

### Builder ladder

Run:

```bash
bash .claude/skills/adw/scripts/dispatch-builder.sh N "${ADW_LOCAL_MODEL:-}"
```

- The local tier is mandatory: a missing model or failed preflight stops the
  run with exit `2`. Never skip to a paid engine silently; `ADW_SKIP_LOCAL=1`
  exists only as an explicit engineer decision.
- Local gets one internal retry with gate output. Only a genuine failed
  attempt escalates to Codex cloud, from the sealed commit.
- Exit `0`: candidate code exists; dispatch VERDICT.
- Exit `20`: both external engines genuinely failed. **Stop and present the
  evidence to the user** (`builder_artifacts` path, cloud diff). Do NOT
  dispatch `builder-claude` on your own — Claude writes production code only
  after the engineer explicitly approves it for that phase (user policy
  2026-08-20: paid engines must be used, Claude is not the silent fallback).
- Exit `2`: infrastructure/protocol error, not a build failure. Fix the cause
  and rerun or report it to the user.

Do not wrap the external command in another Claude agent. Run the adapter in
the FOREGROUND and wait for its exit code — never background it. In a
non-interactive session, ending your turn kills the child process and aborts
the cycle silently (field defect 2026-08-23).

### Verdict

Dispatch `test-agent` in VERDICT mode with the exact gate commit. Use Sonnet
for this mechanical pass; GATE remains Opus because contract design needs
judgment.

- PASS: commit `feat(phase-N): <title>` and continue.
- FAIL: append the full verdict to the dispatch briefing, then seal the failed
  candidate as `wip(phase-N): loop-back K` and rerun the adapter. Maximum three
  cycle loop-backs. The WIP commit is the durable base for the next correction.
- ESCALATE: stop and present the reason to the user.

## Wave scheduling

Use the serial phase flow when the plan has no independent phases. When the
planner declares independent phases, schedule a wave of at most two phases.
Independence requires both explicit `depends_on` and pairwise-disjoint
`owned_files`; separate files do not override an interface or schema dependency.

1. Generate gates and dispatch artifacts for every phase in the wave in
   parallel. Seal all of them in the same `integration_head` commit.
2. Create `adw/waves/wave-N.json` from
   `.claude/skills/adw/wave-manifest.example.json`. `limits` is the latest
   dynamic grant, never static configuration. Preserve `loop_backs` across
   compaction and stop a phase after three.
3. Validate and prepare isolated branches/worktrees:

   ```bash
   python3 .claude/skills/adw/scripts/wave-manager.py validate adw/waves/wave-N.json
   python3 .claude/skills/adw/scripts/wave-manager.py prepare adw/waves/wave-N.json
   ```

4. Build the wave:

   ```bash
   python3 .claude/skills/adw/scripts/wave-manager.py build adw/waves/wave-N.json
   ```

   The manager captures `nvidia-smi` and `ollama ps` before each local grant.
   Local Builders run one at a time. Genuine local failures reset cleanly and
   may escalate to at most two concurrent cloud Builders. Missing local
   infrastructure remains exit `2`; it never becomes a silent cloud grant.
5. Dispatch a fresh VERDICT agent inside each worktree. On PASS, commit the
   candidate on its phase branch and atomically record lowercase `verdict:
   "pass"` plus the exact `verified_commit` in the manifest. On FAIL, increment
   `loop_backs`, commit the WIP correction base, and rebuild only that phase;
   never integrate it. On ESCALATE, stop the wave.
6. After every phase has PASS evidence, integrate deterministically:

   ```bash
   python3 .claude/skills/adw/scripts/wave-manager.py integrate adw/waves/wave-N.json
   ```

   Integration is serial in phase-number order. Each verified commit is merged
   with `--no-ff`, followed by its sealed phase gate and the full lint, format,
   and test chain. A conflict is aborted and returned to planning. An integration
   gate failure stops with the failed merge preserved as evidence.

Never run two Builders in one worktree, merge an unverified candidate, or edit
the manifest non-atomically. Gates and verdicts may be concurrent; integration
never is.

## Low-risk variant

For planner-marked low-risk phases, the same test agent may create the gate and
later issue the verdict. Use separate fresh-context GATE and VERDICT dispatches
for medium/high-risk logic, public interfaces, or ambiguous done-when clauses.

## 3. Close and ship

1. After all phases pass, show outcome, `git diff --stat`, new log entries, and
   measurable goal results.
2. Failed engineer review triggers replanning on the same cycle branch.
3. If the user discards the cycle, return to the base branch, rename the branch
   to `adw/discarded/<slug>`, and record why. Never delete evidence branches.
4. On approval, merge with `git merge --no-ff adw/<slug>`.

The only active workflow is `/adw`. Fan-out remains read-only reference in
`noloop/` and is not shipped here.
