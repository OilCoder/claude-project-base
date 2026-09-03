# Flujograma actual de generación de código

Solo los agentes que intervienen, en el orden en que actúan, y la ruta que el
Router elige según la dificultad del Goal. Debajo de cada agente, los roles de
`CODE_GENERATION_FLOW.md` §3 que cumple. Lo que no es agente (router, gates,
worktrees, integración) lo hace código determinista.

| Ruta | Cuándo | Qué se salta |
|---|---|---|
| Directa | Goal sellado, cambio localizado, riesgo bajo, gate existente | investigación, opiniones, fases, paralelismo |
| Planificada | Goal sellado con varias partes, riesgo medio/alto o sin gate | investigación y opiniones |
| Deliberativa | Goal abierto con incertidumbre arquitectónica, investigación externa o preguntas bloqueantes | nada; termina en decisiones que el usuario sella |

```mermaid
flowchart TD
    USER(["Usuario<br/><i>Goal Owner · aprueba y sella</i>"])
    USER --> GM["goal-manager<br/><i>Goal Manager · State Recorder del Goal</i><br/>fija las señales de ruta: forma del cambio,<br/>riesgo, gate existente, incertidumbre, investigación"]
    GM --> RT{"Router · determinista<br/>goal-routing.mjs"}

    RT -->|"Goal abierto con incertidumbre,<br/>investigación o preguntas bloqueantes"| DELIB
    RT -->|"SEALED · localizado · bajo riesgo ·<br/>gate existente"| DIRECT
    RT -->|"SEALED · varias partes, riesgo medio/alto<br/>o sin gate"| PLANNED

    subgraph DELIB["Ruta deliberativa · decidir antes de planificar"]
        direction TB
        RS["researcher<br/><i>Researcher</i>"]
        AD["advisor ×N<br/><i>Advisors</i><br/>familias de modelo distintas"]
        RC["reconciler<br/><i>Reconciler</i><br/>solo si divergen"]
        AD --> RC
    end
    RS -->|reporte validado| GM
    RC -->|decisión PROPOSED| GM
    AD -->|unanimidad| GM
    GM -->|"Goal con decisiones registradas"| USER

    subgraph DIRECT["Ruta directa · sin deliberación, sin fases, sin paralelismo"]
        direction TB
        PL1["planner<br/><i>Planner · redactor del contrato</i><br/>exactamente un contrato"]
        BU1["builder<br/><i>Builder</i><br/>máx. 2 intentos, gate existente"]
        PL1 --> BU1
    end

    subgraph PLANNED["Ruta planificada · plan DAG por fases"]
        direction TB
        PL2["planner<br/><i>Planner / Engineer</i><br/>fases, dependencias, un contrato por parte"]
        GD["gate-designer<br/><i>Gate Designer / Test Agent</i><br/>solo si el gate no está listo · familia ≠ builder"]
        BU2["builder ×N<br/><i>Builder</i><br/>un worktree por contrato, oleadas en paralelo"]
        PL2 --> GD --> BU2
        PL2 -->|gate ya listo| BU2
    end

    BU1 --> ORQ
    BU2 --> ORQ
    ORQ[["orchestrate.mjs · determinista<br/><i>Verifier · Gate Evaluator · Orchestrator · State Recorder</i><br/>verifica, reintenta con evidencia, integra por oleada, gate final"]]
    ORQ -->|contrato incorrecto: REPLAN_REQUIRED| PL2
    ORQ -->|"gate final PASS · rama codegen/&lt;run&gt;"| USER
```

## Roles por agente

| Agente (`.opencode/agents/`) | Roles que cumple | Modelo por defecto |
|---|---|---|
| `goal-manager` | Goal Manager; registra decisiones y reportes en el Goal | Go `glm-5.3`; Zen solo si Go no cubre requisitos |
| `researcher` | Researcher | pool Go-preferido `research-synthesis` |
| `advisor` | Advisors / Opinion Agents, una instancia por familia | pool Go-preferido `independent-analysis` |
| `reconciler` | Reconciler, solo con divergencia | tercera familia Go o Zen elegible |
| `planner` | Planner / Engineer y redactor del contrato | Go `glm-5.3`; Zen por capacidad |
| `gate-designer` | Gate Designer / Test Agent | pool Go-preferido del Builder, excluyendo su familia |
| `builder` | Builder | Go `minimax-m3`; Zen por capacidad |

## Roles sin agente

| Rol | Quién lo cumple |
|---|---|
| Goal Owner | el usuario, con `--allow-sealed true` |
| Router | `goal-routing.mjs` |
| Model Selector | `model-selection.mjs` + `model-pools.json` |
| Runner | `run-*.mjs` + `builder-runner.mjs` (Go preferido; Zen por capacidad; sin fallback por cuota) |
| Verifier y Gate Evaluator | `gate.mjs`, `run-builder.mjs`, `final-gate.mjs` |
| Orchestrator y State Recorder | `orchestrator.mjs` (`state.json`, `events.jsonl`) |
| Reconciler con unanimidad | `reconcileOpinions` en `opinions.mjs` |
| Reviewer semántico | no existe todavía |
