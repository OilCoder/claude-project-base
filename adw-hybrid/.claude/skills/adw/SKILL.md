---
name: adw
description: Orchestrates the complete hybrid ADW cycle: strategy, plan, validation-first gates, local/Codex/Claude Builder ladder, verdicts, and engineer review. Use for /adw or when the user asks to run the ADW workflow.
---

# Hybrid ADW cycle

You are the main Claude Code orchestrator. Perform research, strategy,
reconciliation, and planning in the main session when they fit its existing
context. Delegate only independent verification or work that materially
benefits from a fresh context; do not implement production code yourself.

## Orchestrator rails

- Inspect only the source evidence needed to research and plan; never edit
  production code.
- Agents communicate through files and return concise summaries to you.
- Report each dispatch boundary to the user.
- Never dispatch two agents to duplicate the same task by default.
- Never read Builder `events.jsonl` unless a compact attempt summary and gate
  tails cannot explain the failure.
- Target a 45-55 workload split between Claude and Codex per cycle. Claude owns
  coordination, strategy, planning, verdict reconciliation, and integration;
  Codex owns independent criticism, gate authoring, implementation, and
  substantial corrections. If one side has taken two consecutive transferable
  tasks, route the next transferable task to the other side.
- Workload balance is a routing guard, not exact token accounting. Before each
  phase boundary, update `adw/state.md` and compact when the context watcher has
  fired. Never keep a large session alive merely to preserve conversational
  history already externalized on disk.
- Machine-facing artifacts and messages are English by default.
- Human-facing language follows the user's language when explicitly requested.

## 1. Planning

1. Form an initial strategy in the main session from the engineer prompt and
   goal.
2. When the decision is materially ambiguous, run one Codex cloud critic through
   `.claude/skills/opinion/scripts/dispatch-opinion-codex.sh`. Skip debate for
   straightforward work; never dispatch a Claude `opinion` agent by default.
3. Reconcile the strategy yourself and record the decision and rationale.
4. Write the phased plan in the main session. Dispatch `planner` only for broad
   or high-risk plans that benefit from a fresh context. `adw/plan.md` is a
   canonical executable plan, not a cumulative journal: replace obsolete
   phases and fold current decisions into place. Move history and completed
   iteration detail to Git or `adw/log.md`, and working resume state to
   `adw/state.md`.
5. Enforce the document budgets before presenting the plan:

   ```bash
   bash .claude/skills/adw/scripts/check-doc-budgets.sh
   ```

   Defaults: `adw/goal.md` <= 3,000 words / 400 lines and `adw/plan.md`
   <= 3,500 words / 450 lines. Exceeding either budget requires consolidation,
   not a larger limit, unless the engineer explicitly approves an exception.
6. Present strategy, phases, done-when conditions, dependencies, and risks to
   the user. Wait for approval.
7. On approval, create `adw/<short-slug>` from the current branch and record the
   base branch. Replanning reuses the reconciled strategy unless it was invalid.

## 2. Phase execution

Every Builder briefing is self-contained and terse. It includes phase scope,
allowed files, done-when, gate path, gate commit, dependencies needed for the
implementation, and previous verdict. It MUST NOT direct the Builder to read
`adw/plan.md`, `adw/goal.md`, or unrelated repository files.

### Gate

1. Create:
   - `adw/dispatch/phase-N.md`: self-contained Builder briefing.
   - `adw/dispatch/phase-N.files`: one allowed path per line; include
     `adw/log.md` only when the Builder must update it.
2. Run Codex cloud to author the validation contract:

   ```bash
   bash .claude/skills/adw/scripts/dispatch-gate-codex.sh N
   ```

   The adapter uses an isolated worktree, permits only
   `adw/gates/phase-N.sh`, and proves that the gate fails before installing it.
   Claude reads only the compact summary and resulting gate. Use `test-agent`
   GATE mode only as an explicit fallback if Codex returns exit `20` and the
   engineer approves the extra Claude work.
3. Commit gate and dispatch artifacts as `chore(phase-N): gate`. The external
   adapter requires a clean worktree.

### Builder ladder

Run:

```bash
bash .claude/skills/adw/scripts/dispatch-builder.sh N "${ADW_LOCAL_MODEL:-}"
```

- Low-risk phases touching at most two implementation files get one local
  attempt, then escalate to Codex cloud from the sealed commit.
- Medium/high-risk phases use Codex cloud directly with `ADW_SKIP_LOCAL=1`.
  This is the engineer-approved default policy; record the choice at dispatch.
- A missing local model or failed preflight on a selected local phase stops the
  run with exit `2`; infrastructure failure never silently changes tiers.
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

Before spending any Claude turn, run the deterministic candidate check with the
exact sealed commit (the Builder's clean starting commit):

```bash
bash .claude/skills/adw/scripts/check-candidate.sh N <sealed-commit>
```

It checks gate integrity, exact file scope, the sealed phase gate, and therefore
the gate's complete lint/format/test chain. On failure, append only its compact
summary and gate tails to the Builder briefing and return directly to Codex. Do
not launch a Claude agent for a mechanically failing candidate.

- Low risk: after a green deterministic check, the main Claude session performs
  one concise semantic spot-check against central done-when behavior. Do not
  launch `test-agent`.
- Medium/high risk: after every candidate in the wave is mechanically green,
  dispatch one `test-agent` for the entire wave. It reviews semantic behavior,
  relevant test coverage, and contract quality without rerunning gates already
  proven green. A serial phase is a one-phase wave.

This Claude review provides model diversity after Codex authors both gate and
implementation while paying at most one fresh Claude context per wave.

- PASS: commit `feat(phase-N): <title>` and continue.
- Mechanical FAIL: send the compact script evidence directly to Codex; no
  Claude verdict is created. Seal the failed candidate only when preserving it
  is necessary for a correction base.
- Semantic FAIL: append the concise Claude verdict to the dispatch briefing,
  seal the failed candidate as `wip(phase-N): loop-back K`, and rerun Codex.
  Maximum three cycle loop-backs.
- ESCALATE: stop and present the reason to the user.

## Wave scheduling

Use the serial phase flow when the plan has no independent phases. When the
plan declares independent phases, schedule a wave of at most two phases.
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

   The manager captures `nvidia-smi` and `ollama ps` before each selected local
   grant. Local Builders run one at a time and get one attempt. Genuine local
   failures reset cleanly and may escalate to at most two concurrent cloud
   Builders. Medium/high-risk phases are explicitly cloud-only.
5. Run `check-candidate.sh` inside each worktree. Return mechanical failures
   directly to Codex. After all candidates are green, use the main session for
   low-risk phases or dispatch one VERDICT agent for all medium/high-risk phases
   in the wave. On PASS, commit each candidate on its phase branch and atomically
   record lowercase `verdict: "pass"` plus the exact `verified_commit` in the
   manifest. On semantic FAIL, increment `loop_backs`, commit the WIP correction
   base, and rebuild only that phase; never integrate it. On ESCALATE, stop the
   wave.
6. After every phase has PASS evidence, integrate deterministically:

   ```bash
   python3 .claude/skills/adw/scripts/wave-manager.py integrate adw/waves/wave-N.json
   ```

   Integration is serial in phase-number order. Each verified commit is merged
   with `--no-ff`, followed by its sealed phase gate. Gates must already encode
   the complete lint, format, test, and behavioral acceptance bar; do not repeat
   the same full chain after a green gate. A conflict is aborted and returned to
   planning. An integration gate failure stops with the failed merge preserved
   as evidence.

Never run two Builders in one worktree, merge an unverified candidate, or edit
the manifest non-atomically. Gates and verdicts may be concurrent; integration
never is.

## Low-risk variant

Planner-marked low-risk phases use deterministic checks plus the main Claude
session; they do not launch validation subagents. Medium/high-risk logic, public
interfaces, or ambiguous done-when clauses share one fresh VERDICT context per
wave after deterministic checks pass.

## 3. Close and ship

1. After all phases pass, show outcome, `git diff --stat`, new log entries, and
   measurable goal results.
2. Failed engineer review triggers replanning on the same cycle branch.
3. If the user discards the cycle, return to the base branch, rename the branch
   to `adw/discarded/<slug>`, and record why. Never delete evidence branches.
4. On approval, merge with `git merge --no-ff adw/<slug>`.

The only active workflow is `/adw`. Fan-out remains read-only reference in
`noloop/` and is not shipped here.
