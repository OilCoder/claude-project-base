# OpenCode code-generation system

This directory is a self-contained, directly executable code-generation system
for OpenCode and the source copied into target projects.

## Layout

- `.opencode/`: agents (supervisor, goal-manager, researcher, advisor,
  reconciler, planner, gate-designer, builder), tools, instructions, and
  namespaced runtime files.
- `opencode.json`: project-level OpenCode configuration.
- `tests/`: tests for the reusable system.
- `CODE_GENERATION_FLOW.md`: conceptual workflow.
- `EVENT_FLOW.md`: routing, parallel plan, Runner, and derived-work events.
- `MODEL_SELECTION_SPEC.md`: model-admission methodology.

Runtime implementation stays under `.opencode/codegen/` to avoid colliding with
a target project's `src/`, `lib/`, `config/`, tests, or package manifest.

## Installation contract

Open this directory directly to develop or test the method. Install it into an
existing target project from this source repository with:

```bash
node opencode/install.mjs /path/to/project --dry-run
node opencode/install.mjs /path/to/project
```

From inside this directory, the equivalent command is:

```bash
npm run install:target -- /path/to/project
```

The installer first runs the release check (`npm run release:check`): every
role must have a `qualified` configuration for the requests production issues,
otherwise nothing is copied. It then copies only reusable `.opencode/` runtime
files, merges missing OpenCode settings (including `default_agent: supervisor`)
and provider whitelist entries, adds the code-generation npm scripts without
replacing the target's `test` script or shipping the maintenance scripts, and
appends local runtime paths to `.gitignore`. Existing project scalar settings
win and are reported.

Install state is recorded in ignored `.opencode/.codegen-install.json`. On a
later update, files that still match the previous installation can be replaced;
a locally modified managed file or conflicting npm script stops installation
before any files are written. `--skip-validation` skips the final
`opencode debug config` check when OpenCode is not available on that machine.

Provider credentials, `.opencode/node_modules/`, run artifacts, generated lock
files, and the installation manifest are machine-local state and are never part
of the payload or source commit. Tests and design documents stay in this source
repository for maintenance but are not copied into target projects.

The interactive session opens on the `supervisor` agent with the provider and
model selected by the user, for example an OpenAI-authenticated GPT model. The
supervisor cannot edit files or run shell commands: a request that changes code
goes through the `codegen_workflow` tool (`draft` a Goal, `approve` it after
the user's explicit approval, `orchestrate`), and every model-backed step runs
in a child process with the configuration certified for that role. If Git has
no HEAD or any controlled step fails, the supervisor reports the blocker and
stops with zero product edits. The role agents are addressable only through
`opencode run --agent <role>`, which is what the runners do.

Automatic model selection prefers an admitted OpenCode Go configuration that
meets the task's capability, risk, and context requirements. A Zen-only model
may be selected directly when no admitted Go configuration is sufficient. With
the console's `Use balance` option enabled, OpenCode continues the same Go
request against the Zen balance after a Go usage limit; this never triggers a
model change. When Zen credits run out, the runner returns
`ZEN_BALANCE_EXHAUSTED`, preserves the run, and requests a recharge.
Authentication, model configuration, rate-limit, availability, partial edits,
scope failures, and Gate failures stop without trying another model. OpenRouter
remains a recorded manual alternative.
A model/provider pair is one configuration: passing a smoke through Zen does
not qualify the same family through Go or OpenRouter.

Select a model interactively with `/models`, or per non-interactive execution:

```bash
opencode run --model opencode-go/minimax-m3 --agent builder "..."
```

Run a sealed Builder contract through the capability-first, Go-preferred policy
(production selection: only configurations certified as `builder`):

```bash
npm run builder -- \
  --contract .codegen-contract/contract.json \
  --work-class localized-low-risk-code-change
```

Generate and validate a phased plan from a project objective:

```bash
npm run planner -- \
  --objective "Implement the requested project behavior" \
  --output .codegen-plan/plan.json

npm run plan:validate -- .codegen-plan/plan.json
```

The Planner uses the configuration certified as `planner` (`opencode-go/glm-5.3`). The plan schema is
`.opencode/codegen/schema/plan.schema.json`. Independent phases form the
same execution wave; the validator rejects cycles, unknown work classes,
unsafe paths, and file overlap between contracts that could run concurrently.

Structure user intent into a Goal, then route it:

```bash
npm run goal:run -- \
  --intent "Prevent registering users with an existing email" \
  --reports .codegen-research/RQ-1.json

npm run goal:run -- --approve .codegen-goal/goal.json   # after the user approves
npm run goal -- validate .codegen-goal/goal.json
npm run goal -- render .codegen-goal/goal.json
npm run goal -- route .codegen-goal/goal.json
```

The Goal Manager runs with the configuration certified as `goal-manager` and
writes `.codegen-goal/goal.json`; `GOAL.md` is rendered deterministically after
validation. A Goal returned as `SEALED` is rejected unless the run passes
`--allow-sealed true`, because only the user seals a Goal. `--approve` seals the
existing Goal deterministically, without a model call, once the user has
approved that exact Goal; it refuses a Goal that still has required pending
research or blocking questions. The Router (`route`)
is a deterministic function of the Goal: an
open Goal with research, architecture uncertainty, or blocking questions routes
`deliberative`; a `SEALED` Goal routes `direct` (localized, low risk, existing
Gate) or `planned`. A `SEALED` Goal that carries deliberative signals must record
its conclusions under `decisions`, so it never routes back to deliberation.

Answer one bounded research question from the Goal:

```bash
npm run researcher -- --question RQ-1
npm run research -- validate .codegen-research/RQ-1.json .codegen-goal/goal.json RQ-1
npm run research -- render .codegen-research/RQ-1.json
```

The Researcher runs one configuration certified as `researcher` from the
Go-preferred `research-synthesis` route. The Runner also sets `OPENCODE_ENABLE_EXA=1` so
hosted search remains available when needed. The
report must cite only sources actually retrieved; the validator binds it to the
Goal question (id, text, budget, allowed source types) and rejects future
retrieval dates, uncited findings, and over-budget source counts. Research
reports never edit the Goal: the Goal Manager records accepted conclusions under
`decisions` on its next run.

Deliberate a blocking open question that carries a closed option set:

```bash
npm run opinions -- --question OQ-1 --advisors 2
```

Advisors run once each on distinct model families certified as `advisor`.
Unanimity on a listed option becomes a proposed decision deterministically;
divergence (or an `OTHER` position) goes to a Reconciler certified as
`reconciler` from a family that gave no opinion, whose decision must cite every
opinion and explain every rejected position. The output under `.codegen-opinions/<id>/` is
`PROPOSED`: the Goal Manager records it under `decisions` (with `opinion_ids`)
and the user seals the Goal.

Run a sealed Goal end to end:

```bash
npm run orchestrate -- --concurrency 2
npm run orchestrate -- --plan .codegen-plan/plan.json --keep-worktrees true
```

The orchestrator is deterministic glue over the runners above. It requires a
Git HEAD and a `SEALED` Goal (an unapproved Goal stops as `APPROVAL_REQUIRED`,
an open one as `DELIBERATION_REQUIRED`), routes the Goal, asks the Planner (the direct route is the Planner capped at one
contract), validates the plan DAG, and then for each execution wave:

1. creates one detached Git worktree per contract under `.codegen-run/<run>/`
   (excluded through `.git/info/exclude`, never the tracked `.gitignore`),
   links the untracked OpenCode layer into it, and seals the contract with a
   generated `.codegen-contract/gate.sh` that wraps the contract's commands;
2. checks Gate readiness: commands resolve and the gate fails on the untouched
   baseline (`verification.expected_baseline: "pass"` opts a refactor out). A
   fixable gap calls the Gate Designer, which may only write under
   `.codegen-contract/`;
3. runs Builders concurrently (`--concurrency`), retrying with an evidence file
   on `GATE_FAIL`, `SCOPE_FAIL`, or `NO_CHANGES` within the contract's
   `max_builder_attempts`; `CONTRACT_BLOCKED` stops as `REPLAN_REQUIRED`,
    provider failures stop as `ESCALATE`, while an exhausted Zen balance stops
    as `USER_ACTION_REQUIRED` with recharge instructions;
4. commits only `allowed_to_modify` paths per contract and cherry-picks each
   result onto the integration branch `codegen/<run>`; the next wave starts from
   that head, which is what satisfies `depends_on`.

After the last wave the final Gate reruns every contract gate on the integrated
tree, checks the merged diff stays inside the union of allowed paths, and runs
the plan's optional `final_verification.commands`. The user's checkout is never
modified; merging `codegen/<run>` is the user's decision. State lives in
`.codegen-run/<run>/state.json` and `events.jsonl` (event names follow
`EVENT_FLOW.md`).

### Watching agents in their own tmux window

Every agent opens in a separate tmux window by default. Every runner and the
orchestrator also accept `--display` (or `CODEGEN_DISPLAY`) to override it:

```bash
npm run orchestrate -- --concurrency 2
tmux attach -t codegen        # from another terminal, or from the phone over SSH
```

- `tmux` (default): each agent runs in its own window through
  `.opencode/codegen/scripts/agent-view.mjs`. Outside tmux, it creates or reuses
  the detached session `codegen`; inside tmux, it adds a window to the current
  session. `CODEGEN_TMUX_SESSION` and `CODEGEN_VIEW_HOLD=0` tune it.
- `inline`: the agent's JSON events are captured silently without opening a
  window.
- `wt`: one Windows Terminal tab per agent from WSL. Written, not yet exercised.
- `vscode`: one VS Code integrated terminal per agent. The runner spools the
  job to `~/.local/state/codegen/vscode-jobs` (`CODEGEN_VSCODE_SPOOL`) and the
  "Codegen Agent Terminals" extension (`vscode-extension/`, install with
  `node opencode/vscode-extension/install.mjs` and reload the window) opens a
  terminal named after the agent that runs `agent-view.mjs` there. Without the
  extension the runner waits for its timeout and reports that no view finished.

From the supervisor, set the variable before starting OpenCode so the tool and
the orchestrator pass it to every agent, for example
`CODEGEN_DISPLAY=vscode opencode` from the VS Code terminal, or
`CODEGEN_DISPLAY=tmux opencode` inside tmux (then `Ctrl-b n` cycles the agent
windows). Do not resume with `opencode -c` after a run: the most recent session
may be a runner's headless agent session, not the supervisor's.

The window header shows the agent, its roles (`config/agent-roles.json`), run id
and attempt, the selected Go model, the context window from
`model-pools.json`, and per-agent lines (contract and allowed paths, objective,
research question and budget, options under deliberation). The body renders
each tool call, the agent's text, and after every step the context in use
against the window, cached/input/output tokens, and cumulative cost. Raw events
still go to the run artifacts, so classification and metrics are identical in
every display. Verified live on 2026-09-03 with `opencode-go/minimax-m2.7` on the
builder fixture.

Operational note: `opencode run` waits for EOF on stdin when stdin is not a
TTY. The runners close stdin; if you script it by hand, add `< /dev/null`.

Not automated yet: replanning after `REPLAN_REQUIRED` (the run stops with
evidence), derived-work contracts (`.opencode/codegen/lib/derived-work.mjs`
classifies findings but nothing feeds it yet), and Goal acceptance criteria,
which are prose and are not executed.

## Certification and admission

Admission is a property of one combination: model, provider, role, and this
harness. It is recorded per role under `admission.roles` in
`.opencode/codegen/config/model-pools.json`; the catalog `status` of a
configuration is capped at `candidate`, so a configuration certified as
`builder` is not thereby admitted as `planner`. Every runner requests
configurations `qualified` for its own role, and production never lowers that
level: `--minimum-status candidate` and `--configuration <id>` (pinning) are
maintenance options that the runners refuse in an installed project (detected
through the install manifest). A target project's user never needs to know that
`candidate` exists.

Certification runs only in this repository, on the real runners and the real
OpenCode binary, against the fixtures under `tests/fixtures/`:

```bash
npm run certify -- run --role builder --configuration builder-go-minimax-m3
npm run certify -- run --role planner --configuration planner-go-glm-5.3
npm run certify -- run --role goal-manager --configuration planner-go-glm-5.3
npm run certify -- run --role gate-designer --configuration builder-go-mimo-v2.5-pro
npm run certify -- run --role researcher --configuration builder-go-gpt-5.6-luna
npm run certify -- run --role advisor --configuration builder-go-gpt-5.6-luna \
  --with builder-go-deepseek-v4-pro,builder-go-minimax-m3
npm run certify -- run --role reconciler --configuration builder-go-minimax-m3
npm run certify -- status
npm run release:check
```

Each run copies a fixture into a throwaway Git repository, executes the role's
runner with the pinned configuration, validates the artifact deterministically
(Gate pass and scope for the Builder, a valid plan on HEAD for the Planner, an
approvable Goal for the Goal Manager, a gate that fails on the baseline for the
Gate Designer, a complete cited report for the Researcher, a proposed decision
for advisors and reconciler), and writes the verdict with its evidence (run id,
duration, tokens, cost, OpenCode version) into the registry. A failure demotes
the role entry to `candidate` and keeps the failure. Run artifacts stay under
the ignored `.opencode/codegen/runs/certification/`.

The release check (`.opencode/codegen/lib/certification.mjs`) resolves the
requests production issues: Goal Manager and Planner on
`complex-engineering-plan`, Builder and Gate Designer on
`localized-low-risk-code-change` and `repository-code-change` (the Gate
Designer excluding the certified Builder's family), Researcher on
`research-synthesis`, two advisor families and a third reconciler family on
`independent-analysis`. It runs as a test (`npm test` is red while the route is
incomplete), inside the installer before any file is copied, and by hand before
a commit. The whole certified route ships with the installer.

Enable Go's console option `Use balance`: after a Go usage limit, the same Go
request continues against Zen credits. Set a Zen monthly spending limit. If the
balance is exhausted, the system stops with `ZEN_BALANCE_EXHAUSTED`; after a
recharge, resume from the preserved run instead of retrying another provider.

Basic-smoke pool (sealed Builder fixture, one attempt each):

- 2026-09-02, Go and Zen: `minimax-m2.7`, `qwen3.6-plus`, `kimi-k2.7-code`.
- 2026-09-03, Go and Zen: `minimax-m3` (new Builder primary), `gpt-5.6-luna`,
  `deepseek-v4-pro`. Go only, no Zen equivalent in the catalog:
  `mimo-v2.5-pro`, `qwen3.8-flash`, `glm-5.3-flash`. The Zen smokes remain
  admission evidence, not quota fallbacks. Separate Zen-only candidates provide
  capacity escalation when the Go candidates fail hard requirements.
- 2026-09-03, Zen-only capacity candidates: `claude-opus-5` PASS in 22 s
  ($0.1009145) and `gemini-3.1-pro` PASS in 20 s ($0.065864). The Zen copy of
  `gpt-5.6-sol` also passed, but was removed from the active registry because
  the authenticated `openai/gpt-5.6-sol` endpoint already supplies that model.
- 2026-09-03, mid/low-tier expansion: Go `deepseek-v4-flash` PASS in 19 s
  ($0.002201476 quota value); Zen `claude-sonnet-5` PASS in 37 s ($0.0407811),
  `claude-haiku-4-5` PASS in 19 s ($0.0178989), `gemini-3.8-flash` PASS in 45 s
  ($0.06101265), and `gemini-3.5-flash-lite` PASS in 14 s ($0.00895502).
  Every smoke changed only `calculator.py` and passed scope, integrity, and Gate
  checks. These remain conservative candidates, not broad qualification.
- `kimi-k3` and `qwen3.8-max` are registered as `watch` on Go without a smoke.

`GO_CATALOG_ANALYSIS.md` records the full Go catalog with quota prices and the
public evidence behind these choices. Basic smokes are compatibility evidence
for candidacy; only the certification above qualifies a role.
