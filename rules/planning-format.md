---
paths:
  - "planning/**/*.md"
---

<!-- description: Single authority for the planning/ hub — folder map, blueprint suite catalog (identity Invariants vs revisable Architecture decisions, Pillars), manifest format, PLAN.md floor format (Non-goals/Invariants/Pillars/Done-when/BLOCKED), and post-floor cycles -->

# Planning Format

This rule is the single authority for everything under `planning/`. It defines the
folder map, the blueprint document suite (project inception), and the `PLAN.md` format
(project execution). Skills drive the procedures (`/blueprint`, `/plan-writing`,
`/phase-executor`); this rule defines the **format** they must produce.

## The `planning/` hub

```
planning/
├── blueprint/      foundation document suite (project inception) — see §A
│   └── MANIFEST.md
├── specs/          single-feature specs written mid-project by the architect agent
├── cycles/         post-floor work cycles (NN_<slug>.md) — see §C
├── bitacora/       session journals (YYYY-MM-DD.md) — format owned by bitacora/SKILL.md
├── PLAN.md         the active execution plan — see §B
└── phase_NN_<name>.md   phase-specific plans (optional)
```

`specs/` format is owned by the `architect` agent; `bitacora/` by `bitacora/SKILL.md`.
This rule governs **§A blueprint**, **§B PLAN.md**, and **§C cycles**.

---

## §A — Blueprint suite (project inception)

The blueprint is the **stable anchor** generated once, before coding, by `/blueprint`
(which delegates each document to the `blueprinter` agent). Documents are processed in
filename order; `09_implementation_plan.md` is always last and seeds `PLAN.md`.

### Document catalog

**CORE — every project kind (3 documents):**

| File | Required sections |
|---|---|
| `00_charter.md` | Goal (measurable, goal-run ready) · Stakeholders · Success criteria (measurable) · **Non-goals** · **Invariants** (identity, 2–4 max) · **Architecture decisions** (revisable) · **Pillars** · Constraints (time/compute/data/budget · external-data classification) · Open questions |
| `01_context_interfaces.md` | External inputs (shape + source) · Outputs/artifacts · Integration points · Environment assumptions · Out-of-scope interfaces |
| `09_implementation_plan.md` | Goal · Phases (each with a **Done when:** line) · **Non-goals** (verbatim from Charter) · **Invariants** (verbatim from Charter) · **Pillars** (verbatim from Charter) · Sequencing/dependencies · Risks |

**KIND PACK — `ml-research` (documents `02`–`04`):**

| File | Required sections |
|---|---|
| `02_problem_data.md` | Task definition · Dataset(s) (source, size) · Splits · Labels · Leakage risks |
| `03_method_experiments.md` | Approach/model · Baselines · Ablations · Hypotheses to test |
| `04_evaluation_protocol.md` | Metrics (headline metric must be class-balanced) · Leakage check · Paired control (a λ=0-style run that must reproduce the baseline) · Validation scheme · Success thresholds · Reproducibility (seeds, environment) |

**KIND PACK — `data-pipeline` (documents `02`–`04`):**

| File | Required sections |
|---|---|
| `02_source_sink_contracts.md` | Upstream schemas · Output schemas · SLAs · Volume/cadence |
| `03_pipeline_architecture.md` | Stages · Orchestration · Idempotency/retries |
| `04_data_quality_validation.md` | Checks · Expectations · Failure handling · Lineage |

**Kind `other` (or the `--core` flag on any kind)** → CORE documents only (`00`, `01`, `09`).

### Mandatory anchor sections (anti-drift)

- **`## Goal` is outcome-shaped and goal-run ready.** A measurable result over the
  artifact — a number the product can fail ("the agent reproduces ≥75% of the report
  spec"), phrased as a verifiable condition so it can be lifted verbatim into a `/goal`
  run. Never a description of activity ("build a system that...").
- `00_charter.md` and `09_implementation_plan.md` **must** contain `## Non-goals`,
  `## Invariants`, `## Architecture decisions`, and `## Pillars` — all specific (not "TBD").
  - **Non-goals**: things the project will explicitly NOT do (prevents feature invention).
  - **Invariants (identity)**: what the project IS — 2–4 maximum. **Litmus test: if it
    names a tool, library, or topology, it is NOT an Invariant — it is an Architecture
    decision.** Identity survives pivots; architecture rarely survives contact with
    real data. Enshrining the "how" at constitutional level turns the blueprint into
    a straitjacket.
  - **Architecture decisions (revisable)**: the current "how" — frameworks, topologies,
    model choices, pipeline shapes. Changing one costs **one line in the decisions
    log**, no ceremony, no fresh approval gate. This is what keeps the blueprint a
    guide instead of a straitjacket.
  - **Pillars**: the decision rails for autonomous work — (1) what Claude never
    decides (interpretation, scope, contract splits), (2) what Claude builds freely
    (mechanical work, exposing tools), (3) ambiguous/design/interpretive →
    **record it, do NOT guess**.
- The Implementation Plan copies Non-goals, Invariants, and Pillars **verbatim** from the
  Charter so it is self-contained for `/plan-writing` to lift into `PLAN.md`.
- An approved **Invariant** may be amended only via a logged manifest decision **and** a
  fresh approval gate — never silently. An **Architecture decision** needs only the
  logged line.
- **External data is classified on day zero** (Charter Constraints): every external
  dataset is tagged public-no-friction / login-gated / to-digitize. **No floor phase may
  depend on data not yet verified in hand** — acquisition friction has derailed real
  phases before; it is a day-zero risk, not an execution surprise.
- **Design docs (`02`–`04`) are hypotheses.** Each opens with the banner
  `> Hypothesis — revisit after first contact with real data.` Half of real design
  churn is only discoverable by building; the revisit is scheduled work, not a failure.

### Manifest format (`planning/blueprint/MANIFEST.md`)

The manifest is the loop's on-disk state — `/blueprint` resumes from it.

```markdown
# Blueprint Manifest

Kind: ml-research
Started: YYYY-MM-DD

## Documents
- [ ] 00_charter.md
- [ ] 01_context_interfaces.md
- [ ] 02_problem_data.md
- [ ] 03_method_experiments.md
- [ ] 04_evaluation_protocol.md
- [ ] 09_implementation_plan.md

## Decisions
- YYYY-MM-DD: kind = ml-research (excludes UX/flow docs)
```

Document markers:

| State | Marker | Meaning |
|---|---|---|
| Pending | `[ ]` | Not started |
| In progress | `[>]` | Currently being drafted/interviewed |
| Approved | `[x]` | User-approved — append `(approved YYYY-MM-DD)` |
| Blocked | `[!]` | Hard stop — append `(BLOCKED YYYY-MM-DD: reason)`; do not skip ahead |
| Discarded | `~~strikethrough~~` | Document dropped (rare — e.g. a kind change removed it); append `(discarded YYYY-MM-DD: reason)` |


---

## §B — PLAN.md format (project execution)

`PLAN.md` is the execution projection of the blueprint — it covers the **floor**: the
enumerable phases that build the minimal end-to-end skeleton which makes the Goal
safely measurable. When `planning/blueprint/09_implementation_plan.md` exists,
`/plan-writing` seeds `PLAN.md` from it (carrying Non-goals, Invariants, and Pillars
verbatim). Once the floor is complete, new work opens **cycles** (§C) — phases are
never appended to the master plan.

### File format

```markdown
# <Project or Phase Name>

## Goal
One sentence. What does this plan accomplish?

## Stack (only in PLAN.md)
Simple table: Layer | Technology

## Structure (only in PLAN.md)
Folder tree showing key paths and their purpose.

## Non-goals
- Explicitly NOT doing X (carried verbatim from the blueprint Charter).

## Invariants
- Must always hold: <what the project IS — identity, never a tool/library/topology>.

## Pillars
- Claude never decides: <interpretation, scope, contract splits — the user's calls>.
- Claude builds freely: <mechanical work, exposing tools, verification plumbing>.
- Ambiguous / design / interpretive → record it, do NOT guess.

## Phases

### Phase N — <Name>
Done when: <one-line, verifiable acceptance criterion for the whole phase>
- [ ] Task description (file or module it targets)
- [>] Task in progress (being worked on right now)
- [x] Task completed (YYYY-MM-DD)
- [!] Task blocked (BLOCKED YYYY-MM-DD: reason)
- ~~Discarded task description~~ (discarded YYYY-MM-DD: short reason)

### Phase N+1 — <Name>
Done when: ...
- [ ] ...

## Cycles index
(Added when the floor is complete — one line per cycle, see §C.)
- [x] 01_honest_metrics — closed 2026-06-08 (goal check: balanced acc 0.61 → 0.64)
- [>] 02_physical_channels — open (planning/cycles/02_physical_channels.md)

## Conventions
Short bullet list of naming rules or constraints relevant to this plan.
```

### Writing rules

- Use plain Markdown only. No HTML, no frontmatter, no badges.
- Tasks use `- [ ]` checkboxes. One task = one action.
- Each task should name the file or module it targets.
- No sub-tasks, no nested checkboxes. Keep it flat.
- No status tables, no emoji columns, no progress bars.
- Avoid vague tasks like "improve X" or "refactor Y". Be specific.
- Phases must be independent — a phase should not depend on assumptions from another phase unless explicitly stated.
- Every phase has exactly one `Done when:` line — a verifiable criterion (`/phase-executor`
  treats it as the phase's acceptance target alongside the verification gate).
- **`Done when:` is outcome-shaped, never activity-shaped.** It describes a quality of
  the artifact, inspectable on disk and traceable to a Charter success criterion.
  Good: `Done when: the rendered report has zero "Not computed" chapters`. Bad:
  `Done when: the renderer is wired up`. Activity-shaped criteria can be satisfied by
  hollow conformance ("report theater") — the phase completes, the product says nothing.
- `## Non-goals`, `## Invariants`, and `## Pillars` are required in `PLAN.md`; if a
  blueprint exists they are copied verbatim from it, otherwise authored with the user.

### Task states

| State | Marker | Format |
|---|---|---|
| Pending | `- [ ]` | `- [ ] Task description` |
| In progress | `- [>]` | `- [>] Task description` (being worked on right now) |
| Completed | `- [x]` | `- [x] Task description (YYYY-MM-DD)` |
| Blocked | `- [!]` | `- [!] Task description (BLOCKED YYYY-MM-DD: reason)` |
| Discarded | `~~strikethrough~~`, no checkbox | `- ~~Task description~~ (discarded YYYY-MM-DD: reason)` |

These markers match the blueprint manifest's (§A) so the whole `planning/` hub speaks one
language: `[ ]` pending · `[>]` in progress · `[x]` done/approved · `[!]` blocked. (`~~…~~`
discarded applies to plan tasks; the manifest rarely drops a document.)

### Update rules

- **In-progress tasks**: mark the task you are actively working on `- [>]`, and flip it to
  `- [x]` the moment it's done. Keep at most one `[>]` task per phase — it shows, at a glance
  and in git history, what is being worked on right now. (In the autonomous loop, phases are
  atomic, so `[>]` may be brief or skipped; it matters most for human-paced work.)
- Mark completed tasks as `- [x]` immediately after finishing them.
- **Blocked tasks**: when a task cannot proceed (missing dependency, unresolved decision,
  failing precondition), mark it `- [!] ... (BLOCKED YYYY-MM-DD: reason)` and surface it to
  the user. A blocked task is a **hard stop signal** — do not silently skip or improvise
  around it. It is the loop-safe state that keeps automation from drifting.
- **Discarded tasks**: when a task becomes obsolete (project pivoted, scope cut, approach
  abandoned, replaced), do **not** delete it. Drop the checkbox, wrap the description in
  `~~...~~`, and append `(discarded YYYY-MM-DD: reason)`.
- Reasons for discarding/blocking must be specific. Examples:
  - `(discarded 2026-04-25: scope creep, moved to Phase 5)`
  - `(discarded 2026-05-02: experiment failed, see planning/bitacora/2026-05-02.md)`
  - `(BLOCKED 2026-05-03: source schema unconfirmed, awaiting vendor)`
- The bitácora's `Errors` section captures the **detail**; `PLAN.md` preserves the **public
  record** that the option was considered and dropped/blocked.
- Do not delete tasks, ever — completed, blocked, discarded, or pending.
- Do not add new tasks to a phase without user approval.
- Never change a stated Non-goal, Invariant, or Pillar without explicit user approval
  (they are the drift anchor; silently altering them defeats the whole point).
  Architecture decisions are the revisable tier — those change via a logged decision line.
- If a phase is fully completed (all tasks `[x]` or discarded), add `(COMPLETED)` to the title.
- **When the floor is complete (all phases COMPLETED), new work opens a cycle (§C)** —
  never append new phases to the master plan. An ever-growing plan becomes a history
  file; cycles keep each effort short, closable, and measured against the Goal.
- Never rewrite or reformat existing content — only update task states and phase titles.

---

## §C — Cycles (project life after the floor)

The floor (`PLAN.md`) builds the skeleton; the project's real life then runs in
**cycles**: doubt → `/investigate` (measure) → cycle on its own branch → measurement
against the Goal → close (merge or discard). Each cycle is one file in
`planning/cycles/NN_<slug>.md` — short, self-contained, and always closed with a
measurement (never abandoned, never appended to the master plan). **A cycle opens
with a number and closes with a number.**

### Cycle file format

```markdown
# Cycle NN — <short name>

Branch: cycle/NN-<slug>

## Origin
What opened this cycle (audit finding, doubt, want — link the bitácora entry or
gap report if one exists) **plus the baseline**: the measured starting number,
copied out of the `/investigate` findings (`debug/` is gitignored — the evidence
lives here or nowhere). For want-born cycles a one-line current-state note is
enough, but the baseline number is never optional.

## Objective
One outcome-shaped, measurable statement tied to the Charter Goal — move the
baseline from X to Y.

## Goal-run command
Ready to paste — derived from the Charter, never re-invented:

    /goal <this cycle's objective> respecting the Pillars in planning/PLAN.md;
          stop when <the closing measurement below is met or provably blocked>

## Tasks
- [ ] Same five task states as §B (one action per task, file/module named).

## Close — measurement against the Goal
Filled at close: the measured result vs the Objective (numbers, not adjectives),
and what it moved on the Charter Goal. A cycle without this section is not closed.
```

### Cycle rules

- **Symptom-born cycles open with `/investigate`.** Measure before opening: an
  isolated diagnostic script produces the numbers that say whether the problem is
  real. If it isn't, log one line in the bitácora and do **not** open the cycle —
  this is the phantom-cycle guard (measuring first has redirected more than one
  "problem" to its actual cause).
- **The baseline is never optional.** No cycle opens without a measured starting
  number in its Origin — it is what the Objective moves (X → Y) and what the Close
  is judged against. Symmetric measurement: open with a number, close with a number.
- **One branch per cycle** (`cycle/NN-<slug>`), created when the cycle opens.
  Autonomous goal-runs run on it; the default branch stays clean; a failed cycle is
  an abandoned branch, not pollution.
- **One objective per cycle.** If a second objective appears mid-cycle, it opens the
  next cycle — it does not stretch this one.
- **Open ↔ index**: opening a cycle adds a `[>]` line to the `## Cycles index` in
  `PLAN.md`; closing it flips the line to `[x]` with the one-line measurement.
- **Closing requires the measurement AND resolving the branch.** "Done" without
  numbers against the Objective is report theater — the cycle stays `[>]` until
  measured (or `[!]` if blocked). And a closed cycle's branch is **merged to the
  default branch or explicitly discarded** (reason in the index line) — a lingering
  unmerged branch is an open cycle wearing a costume; no zombie branches.
- **Execution vehicle**: interactive work, `/phase-executor` on the cycle's tasks, or
  the cycle's Goal-run command via `/goal` (autonomous, condition-stopped). Long
  external runs (training, batch inference) are babysat with `/loop`, not by leaving
  the run unwatched overnight.
- Same marker language as §A/§B; same discard-don't-delete discipline.

## Foundation gap report (the return signal)

When the foundation is insufficient — caught by the §A step-5 coherence check, or by a
Loop 2 `BLOCKED` that traces to a weak plan rather than a code bug — the return to planning
is **not** a bare "blocked, your turn". It carries a structured report so the decision is
informed. The agent **diagnoses and proposes; the user decides** (never auto-applied — the
choice defines the project and is the anti-drift gate).

Report format (present to the user; log a one-line pointer in the manifest Decisions):

```markdown
### Foundation gap — <short title>
- **Where**: phase N / doc 0X / Invariant "<…>"
- **Gap**: what is missing, undefined, or contradictory (concrete, not vague).
- **Why it blocks**: the consequence of proceeding as-is.
- **Options**:
  1. <recommended> — tradeoff / cost
  2. <alternative> — tradeoff / cost
  3. <alternative> — tradeoff / cost
- **Decision needed**: the one question only you can answer.
```

Rules: always give at least two options with the recommended one first; never pick for the
user; never proceed past the gap until the user chooses. If the agent genuinely sees no
viable option, say so explicitly rather than inventing one.

## Cross-references

- See `blueprint/SKILL.md` and `blueprinter` agent for generating the §A suite.
- See `plan-writing/SKILL.md` for the procedure to create/seed and update `PLAN.md`,
  and to open/close §C cycles.
- See `phase-executor/SKILL.md` for phase execution (reads Goal/Non-goals/Invariants/
  Pillars, honors Done-when/BLOCKED, runs the anti-theater check).
- See `bitacora/SKILL.md` for session logging that feeds into plan updates.
