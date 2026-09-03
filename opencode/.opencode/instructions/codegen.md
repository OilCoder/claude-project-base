# OpenCode code-generation system

This directory is a self-contained code-generation system built for OpenCode.
Treat roles, agents, models, and model calls as separate concepts.

## Model selection

- Call `model_select` before dispatching model-backed work.
- Select by work class, risk, context, capabilities, and admission status.
- Never invent a model ID or select a model merely because it appears in the
  provider catalog.
- Use `minimumStatus: "qualified"` for production work.
- Use `minimumStatus: "candidate"` only for an explicit compatibility test.
- Treat the returned alternate as another eligible configuration, not an automatic retry.
- A configured model is not necessarily available now. The Runner must perform
  provider and endpoint preflight before execution.
- Dispatch sealed Builder contracts through
  `.opencode/codegen/scripts/run-builder.mjs`. Selection is capability-first:
  prefer Go, but select a Zen-only candidate directly when no Go candidate
  meets the risk, context, and capability requirements.
- Keep `Use balance` enabled in the OpenCode console. After a Go usage limit,
  OpenCode continues the same request against the Zen balance without changing
  the selected provider or model.
- Never switch models because of quota or execution failure. Authentication,
  configuration, rate-limit, availability, partial-edit, and Gate failures stop
  for classification. OpenRouter is not part of automatic routes.
- `ZEN_BALANCE_EXHAUSTED` is terminal. Preserve the run and ask the user to
  recharge Zen before resuming; do not retry another model.

The authoritative runtime pool is
`.opencode/codegen/config/model-pools.json`. `MODEL_SELECTION_SPEC.md` documents
the evidence and admission methodology.

## Goal, Router, and Researcher

- A run starts from `.codegen-goal/goal.json`, produced by
  `.opencode/codegen/scripts/run-goal.mjs` and validated deterministically.
  `GOAL.md` is rendered from it; never hand-edit the Markdown.
- The Router is `goal.mjs route`, a deterministic function of the Goal. Run it
  before the Planner. Small, sealed, low-risk work with an existing Gate takes
  the direct route; never invoke research, opinions, or the Planner for it.
- Research happens only for a `research_questions` entry that is `pending`,
  through `.opencode/codegen/scripts/run-researcher.mjs`, within the Goal's
  research budget. The Researcher cites only sources it actually retrieved and
  never edits the Goal; the Goal Manager records conclusions under `decisions`.
- A Goal is `SEALED` only after explicit user approval.

## Orchestration

- The interactive parent agent may use the user's chosen provider (for example,
  OpenAI) to supervise and handle high-level decisions. Child runners receive
  the explicit Go-preferred or capacity-escalated Zen model from the registry.
- `.opencode/codegen/scripts/orchestrate.mjs` is the only component that
  chains Router, Planner, Gate readiness, Builders, integration, and the final
  Gate. It is deterministic and spawns the runners; it never calls a model
  directly.
- Every contract builds in its own Git worktree under `.codegen-run/<run>/`
  from the current integration head. Results are cherry-picked onto the branch
  `codegen/<run>`. The user's checkout is never modified.
- A contract is `GATE_READY` only when its gate fails on the untouched
  baseline (or `expected_baseline` is `pass` for a refactor). The Gate
  Designer may only write under `.codegen-contract/`.
- Deliberation (`run-opinions.mjs`) needs an open question with a closed
  option set and distinct model families per advisor. Its output is a
  `PROPOSED` decision, never a sealed one.

## Visibility

- Every agent opens in a separate tmux window by default, showing model, roles,
  context window, and live usage. `--display inline` is the explicit headless
  alternative. Display changes where events are shown, never how they are
  classified.

## Code-generation invariant

The Builder may run checks for self-correction, but it never has final authority
to accept its own changes. Controlled verification and the Gate decide PASS or
FAIL after the Builder returns.

Do not store API keys, access tokens, or provider credentials in this directory.
