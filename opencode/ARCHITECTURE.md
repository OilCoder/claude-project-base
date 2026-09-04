# Arquitectura del sistema codegen (estado real)

**Directriz de diseño:** `CODE_GENERATION_FLOW.md` (flujo, roles, rutas, límites).
**Metodología de admisión de modelos:** `MODEL_SELECTION_SPEC.md`.
**Este documento:** qué de esa directriz está implementado, cómo, y qué no. Se actualiza en el mismo commit que cambia el código. Diagnóstico que motivó la limpieza: `docs/DIAGNOSTICO-2026-09-03.md`.

## Flujo ejecutable desde el supervisor

El usuario conversa con el agente `supervisor` (sin `edit`, sin `bash`, sin `task`). Su única vía de ejecución es la tool `codegen_workflow`, que lanza runners deterministas con `node`:

```text
draft        run-goal.mjs --intent        Goal Manager redacta .codegen-goal/goal.json (DRAFT/RESEARCHING/DECIDED)
deliberate   deliberate.mjs               Researcher por pregunta pendiente · advisors + reconciler por pregunta bloqueante con opciones · Goal Manager revisa el Goal
revise       run-goal.mjs --revise        Goal Manager incorpora las respuestas del usuario a preguntas sin opciones
approve      run-goal.mjs --approve       sello determinista, sin modelo; solo tras aprobación explícita del usuario
orchestrate  orchestrate.mjs              Router → Planner → readiness del Gate (Gate Designer) → Builders en worktrees → cherry-pick a codegen/<run> → Gate final
```

Cada agente corre como `opencode run --agent <rol> --model <configuración certificada para el rol> --format json`. Si el supervisor corre en la TUI de OpenCode **arrancada con `opencode --port 4096`** (sin `--port` la TUI no escucha en ningún puerto), el plugin `.opencode/plugins/codegen-server.js` publica la URL de ese servidor en `.opencode/.codegen-server.json` y los runners se enganchan con `--attach`: las sesiones de los agentes aparecen en la lista de sesiones de la TUI con el nombre `<agente> · <detalle>`. Sin servidor vivo, los eventos se capturan `inline`.

## Tabla de implementación frente a `CODE_GENERATION_FLOW.md`

| Concepto (sección de la directriz) | Estado | Dónde |
|---|---|---|
| Objetivo / Goal (§5.1) | Implementado | `lib/goal.mjs`, `schema/goal.schema.json`, `scripts/run-goal.mjs`, agente `goal-manager` |
| Router determinista (§5.2) | Implementado | `lib/goal-routing.mjs`; direct / planned / deliberative |
| Ruta directa (§8.1) | Implementado como Planner limitado a un contrato | `lib/orchestrator.mjs` (`maxContracts = 1`) |
| Ruta planificada, DAG de fases y oleadas (§5.3, §8.2) | Implementado | `lib/plan-validation.mjs`, `scripts/run-planner.mjs`, agente `planner` |
| Ruta deliberativa: investigar, opinar, decidir (§8.3) | Implementado desde 2026-09-03 | `scripts/deliberate.mjs`, `lib/deliberation.mjs`, `run-researcher.mjs`, `run-opinions.mjs`, `run-goal.mjs --revise`; agentes `researcher`, `advisor`, `reconciler` |
| Decisión técnica vinculante | Implementado: la decisión es `PROPOSED` hasta que el usuario aprueba el Goal que la registra | `lib/opinions.mjs`, `run-goal.mjs --approve` |
| Contrato sellado (§5.4) | Implementado | `orchestrator.mjs` escribe `.codegen-contract/contract.json` en el worktree y lo commitea (forzado si el proyecto lo ignora) |
| Gate Designer (§3, §4) | Implementado, solo cuando el Gate no está listo | `lib/gate.mjs`, `scripts/run-gate-designer.mjs`; familia distinta de la del Builder |
| GATE_READY: el Gate falla en el baseline antes de programar (§4) | Implementado | `gate.checkGateReadiness` |
| Builder (§5.5) | Implementado | `scripts/run-builder.mjs`, agente `builder`; snapshot de archivos y control de alcance |
| Verificación independiente y Gate (§5.6, §5.7) | Implementado | el runner reejecuta los comandos; `lib/final-gate.mjs` sobre la rama integrada |
| Clasificación del fallo (§4) | Implementado parcialmente | `orchestrator.classifyBuilderOutcome`: reintento con evidencia, `REPLAN_REQUIRED`, `USER_ACTION_REQUIRED`, `ESCALATE`, `BLOCKED`. Retorno automático al Planner tras `REPLAN_REQUIRED`: **no implementado**, la corrida para con evidencia |
| Replan acotado por plan inválido | Implementado | `orchestrator.mjs` (`PLAN_RETRY`, presupuesto `max_planner_calls`) |
| Trabajo derivado (§4) | **Diseñado, no cableado** | `lib/derived-work.mjs` clasifica hallazgos; nada lo llama todavía |
| Presupuestos (§9) | Implementado | `budgets` del Goal y del contrato; `max_builder_attempts` |
| Model Selector por rol, Go antes que Zen, sin cambio automático de modelo (§4) | Implementado | `lib/model-selection.mjs`, `lib/builder-runner.mjs`, `config/model-pools.json` |
| Admisión certificada por rol | Implementado, solo mantenimiento | `lib/certification.mjs`, `scripts/certify.mjs` (no se instala); `install.mjs` exige ruta completa |
| Saldo Zen agotado → parar y pedir recarga (§4) | Implementado | `builder-runner.classifyExecution` → `ZEN_BALANCE_EXHAUSTED` |
| OpenRouter fuera de rutas automáticas (§4) | Implementado; sus configuraciones se retiraron del registro el 2026-09-03 | `tests/config-coherence.test.mjs` lo vigila |
| Reviewer semántico (§3) | **No implementado** | los criterios de aceptación del Goal son prosa y no se ejecutan |
| State Recorder (§3) | Implementado | `.codegen-run/<run>/state.json` y `events.jsonl` |

## Artefactos en el proyecto destino

| Ruta | Contenido | Git |
|---|---|---|
| `.opencode/` | agentes, tools, plugin, instrucciones, `codegen/` (lib, scripts, config, schema) | versionado; se actualiza con el instalador y se commitea con el sha del harness |
| `.opencode/package.json` + `node_modules/` | dependencia `@opencode-ai/plugin` | `package.json` versionado, `node_modules` ignorado |
| `.opencode/.codegen-install.json` | manifiesto: hashes, `harness_revision`, `installed_at` | ignorado |
| `.opencode/.codegen-server.json` | URL del servidor de la TUI (plugin) | ignorado |
| `.opencode/codegen/runs/` | eventos y resúmenes de cada agente | ignorado |
| `.codegen-goal/`, `.codegen-research/`, `.codegen-opinions/`, `.codegen-plan/` | Goal y sus versiones previas, informes, opiniones y decisiones, planes | ignorados |
| `.codegen-run/<run>/` | worktrees por contrato y rama de integración | ignorado (`.git/info/exclude`) |
| `codegen/<run>` | rama con el resultado | la fusiona o borra el usuario |

`npm run clean` lista todo lo anterior salvo `.opencode/` y las ramas; con `--yes` lo borra.

## Variables de entorno y flags

- `CODEGEN_DISPLAY`: `inline` o `tui`; sin ella, la tool elige `tui` si hay servidor vivo. `CODEGEN_ATTACH`: URL que la tool pasa a los runners.
- `CODEGEN_FIRST_OUTPUT_SECONDS` (120): un agente sin eventos en ese tiempo se detiene como `LOCAL_RUNNER_ERROR`.
- `CODEGEN_RUNS_DIR`: dónde escribir artefactos (los tests usan un temporal). `CODEGEN_NODE`: binario `node` para la tool.
- `OPENCODE_ENABLE_EXA=1`: lo fija `run-researcher.mjs`.
- Flags de runners: `--display`, `--timeout`, `--minimum-status` (solo mantenimiento; los proyectos instalados rechazan `candidate`), `--configuration` (solo certificación).

## Agentes instalados

`supervisor` (conversación), `goal-manager`, `researcher`, `advisor`, `reconciler`, `planner`, `gate-designer`, `builder`. Todos en `mode: primary` (con `subagent`, `opencode run --agent` cae al agente por defecto), sin `task`, sin `question`; `goal-manager` y `planner` no pueden leer `lib/`, `scripts/`, `config/` ni `tools/` del harness.

## Decisiones registradas

- 2026-09-03: `qualified` describe una combinación modelo + proveedor + rol + harness, certificada en este repositorio y publicada por el instalador; `candidate` es solo mantenimiento.
- 2026-09-03: el visor propio (tmux, wt, VS Code, transcripción guiada, extensión) se eliminó; las sesiones de los agentes se muestran en la TUI de OpenCode vía `--attach`. Evidencia del spike en `docs/DIAGNOSTICO-2026-09-03.md` §7.F: mismo `projectID` para sesiones desde worktrees, NDJSON intacto con `--attach`, plugin con `serverUrl`. Pendiente de confirmar por el usuario: que la lista de sesiones de la TUI se refresque en vivo.
- 2026-09-03: investigación y deliberación quedaron cableadas al supervisor; antes solo las usaban la certificación y los tests. Solo corre la investigación `required`; una pregunta opcional nunca gasta una llamada.
- 2026-09-04: primera corrida real en `las-viewer-v2` con el sistema limpio: la TUI arrancada sin `--port` dejó a los agentes en `inline`, y una pregunta de investigación opcional gastó un Researcher (BLOCKED). Ambas cosas corregidas.
- Criterio de parada vigente: una orquestación real completa en `las-viewer-v2`, observada por el usuario y sin intervención del asistente, antes de añadir funcionalidad.
