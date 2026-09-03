import { validateGoal } from "./goal.mjs"

// Router: decides how much process one Goal needs. It never writes code or
// contracts. A SEALED Goal has already been deliberated (the validator requires
// recorded decisions when deliberative signals are set), so it can only route to
// direct or planned; deliberation applies to Goals that are still open.
export function routeGoal(goal) {
  const validation = validateGoal(goal)
  if (!validation.valid) {
    return { status: "INVALID_GOAL", route: null, reasons: validation.errors }
  }

  const pendingResearch = goal.research_questions.filter(
    (item) => item.required && item.status === "pending",
  )
  const blockingQuestions = goal.open_questions.filter((item) => item.blocking)
  const deliberativeSignals = []
  if (goal.routing.external_research_required) deliberativeSignals.push("external-research-required")
  if (goal.routing.architecture_uncertainty) deliberativeSignals.push("architecture-uncertainty")
  if (pendingResearch.length > 0) deliberativeSignals.push("required-research-pending")
  if (blockingQuestions.length > 0) deliberativeSignals.push("blocking-questions-open")

  if (goal.status !== "SEALED") {
    if (deliberativeSignals.length === 0) {
      return { status: "GOAL_NOT_SEALED", route: null, reasons: ["goal-requires-user-approval"] }
    }
    if (goal.budgets.max_research_calls === 0 && pendingResearch.length > 0) {
      return {
        status: "BUDGET_BLOCKED",
        route: null,
        reasons: [...deliberativeSignals, "no-research-budget"],
      }
    }
    return {
      status: "ROUTED",
      route: "deliberative",
      reasons: deliberativeSignals,
      allowed_events: [
        "RESEARCH_REQUESTED",
        "RESEARCH_COMPLETED",
        "DECISION_RECONCILED",
        "GOAL_REVISED",
      ],
      budgets: {
        planner_calls: 0,
        research_calls: goal.budgets.max_research_calls,
        opinion_calls: 0,
      },
    }
  }

  const direct =
    deliberativeSignals.length === 0 &&
    goal.routing.change_shape === "localized" &&
    goal.routing.risk === "low" &&
    goal.routing.existing_gate
  if (direct) {
    return {
      status: "ROUTED",
      route: "direct",
      reasons: ["localized", "low-risk", "existing-gate"],
      allowed_events: [
        "CONTRACT_DRAFTED",
        "CONTRACT_VALIDATED",
        "BUILDER_DISPATCHED",
        "VERIFICATION_STARTED",
      ],
      // The Planner still writes the single contract of the direct route.
      budgets: {
        planner_calls: 1,
        research_calls: 0,
        opinion_calls: 0,
        contracts: 1,
      },
    }
  }

  if (goal.budgets.max_planner_calls === 0) {
    return { status: "BUDGET_BLOCKED", route: null, reasons: ["no-planner-budget"] }
  }
  return {
    status: "ROUTED",
    route: "planned",
    reasons: [
      `shape:${goal.routing.change_shape}`,
      `risk:${goal.routing.risk}`,
      ...(goal.routing.existing_gate ? [] : ["gate-preparation-may-be-required"]),
      ...(deliberativeSignals.length > 0 ? ["deliberation-recorded"] : []),
    ],
    allowed_events: [
      "PLAN_REQUESTED",
      "PLAN_GENERATED",
      "PLAN_VALIDATED",
      "DAG_READY",
      "WAVE_READY",
    ],
    budgets: {
      planner_calls: goal.budgets.max_planner_calls,
      research_calls: 0,
      opinion_calls: 0,
    },
  }
}
