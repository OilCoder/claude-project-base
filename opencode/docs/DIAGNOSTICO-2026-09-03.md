# Diagnóstico del sistema codegen (OpenCode) — 2026-09-03

Documento de revisión. **No propone ejecutar nada**: recoge el estado real del sistema, la evidencia de lo que funciona, lo que OpenCode ofrece hoy de forma nativa y las opciones disponibles, para decidir con calma. Toda cifra viene de tres inventarios de solo lectura hechos hoy sobre `claude-project-base/opencode`, `las-viewer-v2`, la instalación de OpenCode 1.18.27 y su documentación.

## Contexto

El usuario intentó programar `las-viewer-v2` con el sistema y terminó dedicando el día a corregir el sistema mismo. Sensación: demasiados agentes, scripts y carpetas que crecieron poco a poco; pérdida de control. Pidió parar, revisar qué está mal y documentar antes de seguir corrigiendo.

## Resumen ejecutivo

- **Ninguna orquestación completa ha ocurrido jamás sobre un proyecto real.** Los 1.100 runs registrados son fixtures de tests con un `opencode` falso (5 tokens de entrada y 5 de salida). La única evidencia real de modelos: 31 smokes de builder, 11 certificaciones por rol sobre fixtures, un builder en `/tmp` y un Goal Manager en `las-viewer-v2` (20 s, DECIDED). Nunca hubo rama de integración ni Gate final en un proyecto de verdad.
- **El sistema tiene un día de vida en git**: 21 commits, 111 archivos, cero borrados. De esos 21 commits, 8 son `fix` y 4 `feat` motivados por fallos: **12 de 21 son reacción a fallos**, y el ritmo de fixes se aceleró en la última hora.
- **El flujo documentado no es el flujo ejecutable.** La documentación describe Goal → Investigación → Deliberación → Plan → Gate → Build. Lo que se ejecuta desde el supervisor es Goal → sello → Plan → Gate → Build → integración → Gate final. Researcher, advisors y reconciler no son alcanzables desde el supervisor; `derived-work.mjs` no lo llama nadie.
- **Cinco de las ocho correcciones de hoy fueron del visor de agentes** (spool, extensión, tmux, VS Code): unas 1.100 líneas que existen porque los runners lanzan `opencode run` sin interfaz y hay que reconstruir la vista a mano. OpenCode 1.18 ya puede mostrar esas sesiones en su TUI si los runners se enganchan al servidor del supervisor (por verificar, ver §7).
- **Seis documentos de diseño en la raíz (≈1.900 líneas) describen cosas no implementadas.** Dos fuentes de verdad es el problema de higiene más directo.
- **Higiene de proceso, no de código, fue lo que falló hoy**: reinstalaciones que dejan diffs sin commit en el proyecto destino, "verificado" dicho sin evidencia (la extensión 0.1.4 nunca funcionó), tests que dejan 2.734 archivos de artefactos en el árbol del harness, commits con la suite roja.

## 1. Estado del sistema (inventario)

Raíz: `claude-project-base/opencode`. 114 archivos sin contar `node_modules` ni `runs/` (111 en git).

| Área | Archivos | Líneas | Contenido |
|---|---|---|---|
| `.opencode/agents/` | 8 | 409 | supervisor, goal-manager, planner, gate-designer, builder, researcher, advisor, reconciler |
| `.opencode/tools/` | 2 | 109 | `codegen_workflow.js` (draft / approve / orchestrate), `model_select.js` |
| `.opencode/instructions/` | 1 | 93 | `codegen.md`, inyectado por `opencode.json` |
| `.opencode/codegen/lib/` | 19 | 3.245 | núcleo determinista |
| `.opencode/codegen/scripts/` | 13 | 2.116 | runners y CLIs |
| `.opencode/codegen/schema/` | 5 | 802 | JSON Schema solo documental; la validación real es a mano en `lib/` |
| `.opencode/codegen/config/` | 2 | 1.976 | `model-pools.json` (36 configuraciones) y `agent-roles.json` |
| `tests/` | 23 + 24 fixtures | — | 107 tests, `node --test` |
| `vscode-extension/` | 4 | 258 | extensión "Codegen Agent Terminals" 0.1.5 |
| raíz | 11 | ≈2.100 | `install.mjs`, `README.md` (337), 5 documentos de diseño en español (1.559) |

Código de producción: **≈5.400 líneas** (lib + scripts) más 409 de prompts, 802 de esquemas y 1.976 de registro.

### Módulos de `lib/` por tamaño

`orchestrator.mjs` 385 · `display.mjs` 386 · `goal.mjs` 258 · `plan-validation.mjs` 239 · `model-selection.mjs` 237 · `opinions.mjs` 171 · `agent-run.mjs` 166 · `research-report.mjs` 149 · `artifact-summary.mjs` 149 · `builder-runner.mjs` 141 · `certification.mjs` 138 · `worktrees.mjs` 126 · `goal-routing.mjs` 103 · `cli.mjs` 97 · `gate.mjs` 78 · `final-gate.mjs` 71 · `run-metrics.mjs` 62 · `derived-work.mjs` 49 · `process.mjs` 40.

### Scripts

`certify.mjs` 507 · `run-opinions.mjs` 272 · `run-builder.mjs` 212 · `run-goal.mjs` 195 · `run-researcher.mjs` 170 · `run-planner.mjs` 161 · `run-gate-designer.mjs` 151 · `agent-view.mjs` 139 · `run-builder-smoke.sh` 117 · `orchestrate.mjs` 83 · `research.mjs` 46 · `goal.mjs` 34 · `validate-plan.mjs` 29.

### Superficie de configuración

- **Variables de entorno (producción)**: `CODEGEN_DISPLAY`, `CODEGEN_VIEW_DETAIL`, `CODEGEN_VIEW_PREVIEW`, `CODEGEN_VIEW_HOLD`, `CODEGEN_TMUX_SOCKET`, `CODEGEN_TMUX_SESSION`, `CODEGEN_VSCODE_SPOOL`, `CODEGEN_NODE`, `CODEGEN_COLOR`, `NO_COLOR`, `TMUX`, `OPENCODE_ENABLE_EXA`, `CODEGEN_BUILDER_TIMEOUT_SECONDS`, `TMPDIR`. Más 11 variables `FAKE_*` solo para tests.
- **Flags de CLI**: entre 6 y 11 por runner (`--goal --plan --directory --display --run-id --timeout --gate-timeout --concurrency --keep-worktrees --minimum-status`, etc.). El parser es posicional estricto: `--clave valor`, sin `=` ni booleanos.
- **Registro `model-pools.json`**: 36 configuraciones (13 opencode-go, 13 opencode, 9 openrouter, 1 ollama); 33 `candidate`, 3 `watch`; `runner_policies` para 7 roles; 6 clases de trabajo; `admission.roles` por configuración.
- **`opencode.json`**: `default_agent: supervisor`, `subagent_depth: 1`, 5 proveedores habilitados con listas blancas de modelos.

### Redundancias detectadas

1. `CODEGEN_DISPLAY` tiene default `tmux` en `agent-run.mjs` y `inline` en `certify.mjs` y en el tool `codegen_workflow.js`.
2. `enabled_providers` incluye `openai` sin bloque `provider` ni configuración en el registro. OpenRouter tiene 9 configuraciones que las instrucciones excluyen de las rutas automáticas: un cuarto del registro es inerte.
3. Las listas blancas de `opencode.json` duplican las configuraciones de `model-pools.json`; ningún test comprueba que coincidan.
4. `agent-roles.json` duplica `AGENT_PURPOSE` de `artifact-summary.mjs` (mismos 8 agentes, distinto idioma).
5. `--minimum-status` existe en todos los runners aunque las instrucciones digan que no hay nivel inferior que pedir; solo lo usan los tests.
6. Dos `.gitignore` (raíz y `.opencode/`) solapan 4 rutas.
7. Timeouts en tres sitios distintos (`--timeout`, `--gate-timeout`, `CODEGEN_BUILDER_TIMEOUT_SECONDS`, default 900 s en `process.mjs`).

### Instalación

`install.mjs` copia todo `.opencode/` salvo `node_modules`, `package.json`, `package-lock.json`, `runs/` y el manifiesto. Por tanto **se envían al proyecto destino** `certify.mjs`, `run-builder-smoke.sh`, `derived-work.mjs`, los esquemas y el registro completo. **No se envía `.opencode/package.json`**, de modo que las tools importan `@opencode-ai/plugin` sin manifiesto: hoy hubo que hacer `npm install` a mano en `las-viewer-v2/.opencode` y el README no lo documenta. El manifiesto `.codegen-install.json` guarda hashes de archivos pero no el sha del harness instalado.

## 2. Qué funciona de verdad (evidencia)

Runs en `opencode/.opencode/codegen/runs/` (ignorados por git, 2.734 archivos, 16 MB):

| Tipo | Runs | Resultado | Naturaleza |
|---|---|---|---|
| builder | 535 | 434 PASS, 55 GATE_FAIL, 37 ZEN_BALANCE_EXHAUSTED… | fixtures de tests con `opencode` falso |
| planner | 183 | 133 PASS, 50 PLAN_INVALID | fixtures |
| goal | 116 | 38 SEALED, 38 SEALED_WITHOUT_APPROVAL… | fixtures |
| researcher / gate-designer / opinions | 78 / 77 / 77 | mitad y mitad por diseño del test | fixtures |
| builder-smoke | 31 (29 modelos) | 24 PASS, 5 INFRA_ERROR, 2 FAIL | **reales**, `calculator.py`, 2026-09-02/03 |
| certification | 11 | 9 PASS, 2 FAIL (reintentados) | **reales**, fixtures, 2026-09-03 |
| orchestrate | **0 persistidos** | — | el estado vive en `<proyecto>/.codegen-run/`, y los de tests estaban en `/tmp` |

Conclusión: la ruta certificada (Luna, glm-5.3, minimax-m3, mimo-v2.5-pro, deepseek-v4-pro) está probada **por rol y sobre fixtures**. El encadenado completo Plan → Gate → Build → integración → Gate final solo ha pasado con un `opencode` simulado.

### `las-viewer-v2`

- Un commit baseline `367447b` (datos LAS, `.opencode`, `.vscode`, config). Sin ramas `codegen/*`, sin worktrees.
- Un solo run real: Goal Manager con `opencode-go/gpt-5.6-luna`, 20 s, 1.065 tokens de salida, Goal `count-las-files` DECIDED, válido, sin sellar.
- 14 archivos de `.opencode/` modificados y uno nuevo sin commit (actualizaciones del harness instaladas hoy). Idénticos byte a byte al harness en `20c6784`.
- Proceso `opencode` del supervisor todavía vivo (pid 1010426). Spool de la extensión vacío.
- Respaldo del proyecto anterior en `~/las-viewer-v2.backup-20260903T182529Z.tar.gz`.
- **Observación sin explicar**: `.codegen-goal/` desapareció dos veces hoy (existía a las 18:56, no tras la limpieza que no lo tocó; reapareció a las 19:01 y volvió a desaparecer). Nada en el harness borra ese directorio (revisado `run-goal.mjs`, `goal.mjs`, `agent-run.mjs`, `cli.mjs`, `codegen_workflow.js`). Queda como pregunta abierta; se puede investigar en solo lectura consultando la base de sesiones de OpenCode (`opencode db`) por escrituras y comandos sobre esa ruta.

## 3. Flujo documentado frente a flujo ejecutable

| Concepto | Implementado en | ¿Alcanzable desde el supervisor? |
|---|---|---|
| Goal, sello, Router | `goal.mjs`, `goal-routing.mjs`, `run-goal.mjs` | Sí |
| Plan, contratos, replan acotado | `plan-validation.mjs`, `run-planner.mjs`, `orchestrator.mjs` | Sí |
| Gate, preparación, Gate final | `gate.mjs`, `final-gate.mjs`, `run-gate-designer.mjs` | Sí |
| Builder, worktrees, cherry-pick, eventos | `run-builder.mjs`, `worktrees.mjs`, `orchestrator.mjs` | Sí |
| Ruta directa | `orchestrator.mjs` (`maxContracts = 1`) | Sí, como Planner limitado a un contrato |
| Ruta deliberativa | `goal-routing.mjs` | **No**: `orchestrate` para con `DELIBERATION_REQUIRED` |
| Investigación | `run-researcher.mjs`, `research-report.mjs`, agente | **No**: solo certificación, tests y alias npm |
| Opiniones y reconciliación | `run-opinions.mjs`, `opinions.mjs`, 2 agentes | **No**: ídem; la decisión queda `PROPOSED`, nunca se sella |
| Trabajo derivado | `derived-work.mjs` | **No**: cero llamadas en producción; documentado en 4 documentos |
| Admisión por rol, certificación | `model-selection.mjs`, `certification.mjs`, `certify.mjs` | Sí (admisión en cada runner; certificación solo mantenimiento, pero `install.mjs` la exige) |
| Vistas inline / tmux / wt / vscode | `agent-run.mjs`, `display.mjs`, `agent-view.mjs`, extensión | Sí las cuatro |

Documentos de la raíz que describen el flujo completo: `CODE_GENERATION_FLOW.md` (630), `MODEL_SELECTION_SPEC.md` (512), `EVENT_FLOW.md` (215), `GO_CATALOG_ANALYSIS.md` (120), `FLUJOGRAMA_ACTUAL.md` (82), `README.md` (337). Ninguno marca qué está implementado y qué no.

## 4. Historia de hoy (21 commits, 12:58 → 19:00)

| Commit | Hora | Causa raíz |
|---|---|---|
| `8b080fb` | 14:50 | el tool lanzaba el binario de OpenCode en vez de `node` |
| `1d59309` | 14:39 | agentes en `mode: subagent` caían al agente por defecto |
| `b2808eb` | 15:25 | tests dejaban ventanas tmux y procesos zombis |
| `3b8fe67` | 15:51 | doble renombrado `.taken.taken`; terminal por shell |
| `bdb22be` | 16:03 | agentes leían el código del harness (0,17 USD por un Goal de un archivo) |
| `3857ced` | 16:16 | esquema permitía `max_planner_calls: 0` → BUDGET_BLOCKED |
| `5e7a5bc` | 16:34 | dos ventanas de VS Code se robaban trabajos |
| `1066076` | 16:39 | vista previa perdía la indentación |
| `77af45d` | 18:33 | plan rechazado por globs `*.json`; corrida muerta con presupuesto 1 |
| `c01d2be` | 18:40 | trabajos reclamados por un host de extensión muerto |
| `f533839` | 18:50 | `.gitignore` del proyecto bloqueaba el commit del contrato |
| `20c6784` | 19:00 | la extensión 0.1.4 no tenía la función `poll`: nunca abrió una pestaña |

Patrón: cada corrección abrió el siguiente fallo un escalón más adelante en el mismo flujo. Es lo que se espera de un sistema que nunca ha completado el bucle en condiciones reales: los fallos no son ruido, son el frente de avance. El problema es que se abordaron como incidentes sueltos, con parches y reinstalaciones, sin un criterio de parada.

Errores de proceso del asistente en la sesión, para que consten: afirmar "verificado" sobre la extensión 0.1.4 cuando lo que funcionaba era la versión vieja en otra ventana; matar procesos y renombrar archivos del spool en el proyecto del usuario; reinstalar sin commitear; commits con la suite roja hasta que el gate pasó a exigir `# fail 0`.

## 5. Qué ofrece OpenCode 1.18.27 de forma nativa

Verificado con la CLI local, el esquema de configuración y los tipos de `@opencode-ai/plugin` y `@opencode-ai/sdk`:

- **Agentes** en `.opencode/agents/*.md` con `mode` primary/subagent, modelo, permisos por herramienta (`edit`, `bash` con patrones, `read`, `webfetch`, etc.). Subagentes vía tool `task` o `@nombre`, cada uno en su sesión hija con su propio contexto; `subagent_depth` limita el anidamiento; `task_id` permite reanudar el mismo subagente. **No hay traspaso primary → primary**.
- **Comandos** `.opencode/commands/*.md` con `agent`, `model`, `subtask`, `$ARGUMENTS` e interpolación de shell. Se invocan como `/nombre` o `opencode run --command`.
- **Tools propias** `.opencode/tools/*.js`: `execute(args, ctx)` con `abort`, `metadata()` para actualizar la vista en vivo y `ask()` para permisos. Sin streaming de stdout.
- **Plugins** `.opencode/plugins/*.ts`: reciben `client` (SDK completo), `serverUrl`, `$`; hooks `event` (recibe **todos** los eventos SSE de **todas** las sesiones), `tool.execute.before/after`, `permission.ask`, `chat.*`, y `experimental_workspace.register` (adaptadores de worktree).
- **Servidor y SDK**: `opencode serve` / `opencode --port N` (la TUI también escucha), OpenAPI en `/doc`, SSE en `/event`; el SDK crea sesiones, envía prompts (sync y async), lista hijos, hace fork y **crea PTYs por HTTP**.
- **`opencode run`**: `--agent`, `--model`, `--format json` (NDJSON, solo eventos de la sesión raíz), `--attach <url>` para crear la sesión en un servidor ya en marcha, `--dir`, `--port`. Sin TTY, los permisos `ask` se **rechazan automáticamente**.
- **Sesiones** en SQLite (`~/.local/share/opencode/opencode.db`), consultables con `opencode db`, `opencode session list`, `opencode export`, `opencode stats`. Las sesiones hijas se navegan en la TUI (solo lectura).
- **Proveedor `opencode-go`** integrado (misma clave que Zen, catálogo distinto). Un modelo por agente; **no existen** pools, fallback por agente, certificación ni handoff.

Lo que el harness reimplementa y OpenCode ya cubre: supervisión de procesos y captura de eventos (SDK/SSE o plugin), permisos por agente, terminales (PTY), métricas (`opencode stats`, base de datos), fijar agente y modelo por comando. Lo que no cubre y justifica el harness: secuencia determinista entre roles, contratos sellados, admisión por rol, selección de modelo con alternativas, Gates ejecutables.

## 6. Diagnóstico: causas raíz

1. **Alcance adelantado a la evidencia.** Siete roles, deliberación, investigación, certificación por rol, cuatro vistas y una extensión, antes de un solo PASS real del bucle básico. El propio patrón Goal-run del usuario lo dice: la autonomía sin suelo produce basura confiada; aquí el suelo (el bucle básico) no está probado.
2. **Infraestructura propia donde el host ya tiene la suya.** El visor existe porque cada agente corre como `opencode run` invisible para la TUI. Es el subsistema más frágil (5 de 8 fixes) y el que peor cumple lo que el usuario pidió ("entendible como en OpenCode").
3. **Dos fuentes de verdad.** Seis documentos describen lo que el sistema "debería" hacer; el código hace otra cosa; nada señala la diferencia.
4. **Proceso sin gates mecánicos.** La disciplina dependió de voluntad: instalar sin commitear, "verificado" sin evidencia, artefactos de test en el árbol, commits con tests rojos. La memoria del usuario ya lo dice: la disciplina impuesta por hooks sobrevive, la que depende de voluntad no.
5. **Cuarta implementación paralela.** `clasico/`, `noloop/`, `adw-hybrid/` y `opencode/` comparten Goal, Plan, Contrato, Gate, veredictos y worktrees con cuatro sintaxis distintas. Fuera del alcance de esta revisión, pero es parte de la sensación de "muchas carpetas".

## 7. Qué se puede hacer (opciones, sin decidir)

Ordenadas de menor a mayor intervención. Cada bloque es independiente.

### A. Reglas de proceso (cero código, efecto inmediato)

- Congelar funcionalidades hasta un PASS real. Criterio de parada explícito: **una orquestación del Goal `count-las-files` en `las-viewer-v2` que termine en `RUN_COMPLETED` con rama `codegen/<run>` y Gate final PASS, sin intervención del asistente, observada por el usuario.**
- Una instalación = un commit inmediato en el proyecto destino con el sha del harness en el mensaje. Cero diffs colgando.
- El asistente no toca el proyecto destino salvo petición explícita; no mata procesos ni edita el spool.
- Nada se declara "verificado" sin evidencia visible por el usuario (línea de log, nombre de test o pestaña en su ventana).
- Commit solo con `# fail 0` en la salida de `npm test`.

### B. Higiene mecánica (código mínimo, riesgo bajo)

- `install.mjs` escribe el sha del harness en `.codegen-install.json`; `install.test.mjs` lo comprueba.
- Los tests escriben artefactos en un directorio temporal, nunca en `.opencode/codegen/runs/` (elimina los 2.734 archivos sueltos).
- `install.mjs` copia `.opencode/package.json` y ejecuta `npm install`, o falla con mensaje claro.
- Unificar el default de `CODEGEN_DISPLAY` (inline).
- Un test que compruebe que las listas blancas de `opencode.json` y las configuraciones de `model-pools.json` coinciden.
- Script `codegen:clean` para borrar `.codegen-*`, `.codegen-run/` y `runs/` del proyecto destino.

### C. Poda (borrar lo muerto o inerte)

- `lib/derived-work.mjs` y su test (nadie lo llama).
- 9 configuraciones OpenRouter y `openai` en `enabled_providers` (inertes por regla propia), o marcarlas `enabled: false`.
- `agent-roles.json` o `AGENT_PURPOSE` (uno de los dos).
- Exportaciones solo usadas por tests (`listWorktrees`, `isSymbolicLink`, `pathPatternsOverlap`…).
- Vista `wt` (nunca probada) y, según decisión sobre el visor, `tmux`.
- Excluir de la instalación lo que es solo mantenimiento: `certify.mjs`, `run-builder-smoke.sh`, esquemas si siguen siendo documentales.

### D. Una sola fuente de verdad documental

- Fundir los seis documentos de la raíz en dos: `README.md` (operación) y un `ARCHITECTURE.md` con tabla explícita **implementado / no implementado / solo mantenimiento**. Los documentos de diseño originales pueden archivarse en `docs/archive/` con fecha.

### E. Decisión sobre investigación y deliberación (3 agentes, ≈600 líneas, 3 esquemas)

Opciones: (1) sacarlos del producto instalado y dejarlos como área de mantenimiento en el harness hasta que el bucle básico pase en un proyecto real (el instalado queda con 5 agentes); (2) cablearlos al tool `codegen_workflow` para que el flujo documentado sea el ejecutable; (3) borrarlos. La opción 1 es la de menor riesgo y menor código nuevo.

### F. Visor nativo (spike acotado, con go/no-go)

Hipótesis: si el usuario arranca `opencode --port 4096` y los runners lanzan `opencode run --attach http://127.0.0.1:4096 --agent <rol> --dir <worktree> --format json`, las sesiones de los agentes se crean en el servidor del supervisor y aparecen en la lista de sesiones de la TUI, navegables en vivo, con la presentación nativa de OpenCode. Si se cumple, se pueden borrar spool, extensión, tmux, wt, `agent-view.mjs`, `display.mjs` y `artifact-summary.mjs` (≈1.100 líneas más la extensión).

Verificado hoy: la TUI acepta `--port`; `run` acepta `--attach` y `--dir`.

Por verificar (cualquiera de los cuatro tumba la hipótesis):
1. Las sesiones creadas con `run --attach` aparecen en vivo en la lista de sesiones de la TUI del supervisor y se pueden abrir como vista de solo lectura.
2. `run --attach --format json` sigue emitiendo NDJSON en el stdout del runner (la clasificación de resultados y las métricas dependen de ello).
3. Cómo conoce el runner la URL: el `ctx` de una tool no la expone; un plugin sí (`serverUrl`). Candidato simple: puerto fijo y variable `CODEGEN_ATTACH`; alternativa: un plugin mínimo que escriba la URL en un archivo.
4. Permisos: sin TTY, `run` rechaza los `ask` automáticamente. Con `--attach`, hay que confirmar que la TUI no bloquea al runner con un prompt de permiso.

Si el spike falla: dejar solo `inline` + `vscode`, borrar `tmux` y `wt`, y no tocar más el visor hasta el PASS real.

### G. Fuera de alcance, para más adelante

- Consolidar los cuatro métodos del repositorio (`clasico/`, `noloop/`, `adw-hybrid/`, `opencode/`) o declarar cuál es el vigente.
- Certificar el rol `supervisor`; replan automático tras `REPLAN_REQUIRED`; ejecutar los criterios de aceptación del Goal.

## 8. Definición de "control recuperado" (medible)

- Un documento de arquitectura con tabla implementado / no implementado, y cero documentos contradictorios en la raíz.
- Árbol del harness sin archivos sueltos tras `npm test`.
- `las-viewer-v2` sin diffs sin commit; manifiesto con sha del harness.
- Número de agentes instalados y líneas de producción conocidos y decididos (hoy: 8 agentes, ≈5.400 líneas).
- Una orquestación real completa en `las-viewer-v2`, observada por el usuario, sin ayuda del asistente.

## 9. Estado inmediato a tener en cuenta

- Supervisor de OpenCode aún abierto en `las-viewer-v2` (pid 1010426). Cerrarlo desde su terminal cuando se decida.
- 14 archivos de `.opencode/` + `artifact-summary.mjs` sin commit en `las-viewer-v2`. Dos salidas limpias: commitearlos ("chore: codegen system @ 20c6784") o restaurar al baseline con `git checkout -- .opencode && git clean -f .opencode` y reinstalar más adelante.
- Extensión 0.1.5 instalada en `~/.vscode-server/extensions` (0.1.4 eliminada); requiere Reload Window si se vuelve a usar la vista `vscode`.
- Respaldo `~/las-viewer-v2.backup-20260903T182529Z.tar.gz` pendiente de decidir si se conserva.

---

# Anexos: investigación completa

Material bruto de los tres inventarios (harness, evidencia de runs y repositorio, capacidades nativas de OpenCode), ordenado para consulta.

## Anexo A. Inventario de archivos del harness

### Agentes (`.opencode/agents/`, 409 líneas)

| Archivo | Líneas | Propósito |
|---|---|---|
| `advisor.md` | 41 | Una opinión independiente y con evidencia sobre una pregunta de decisión cerrada; nunca edita código |
| `builder.md` | 45 | Implementa un contrato sellado con el modelo elegido para esa ejecución |
| `gate-designer.md` | 50 | Escribe un Gate ejecutable y no trivial bajo `.codegen-contract/` antes de que corra el Builder |
| `goal-manager.md` | 65 | Convierte intención + informes de investigación en un Goal estructurado; no toma decisiones de producto |
| `planner.md` | 75 | Convierte un objetivo en un plan validado de contratos sellados por fases |
| `reconciler.md` | 37 | Compara opiniones divergentes y produce una decisión PROPOSED |
| `researcher.md` | 53 | Responde una pregunta de investigación acotada con fuentes citadas |
| `supervisor.md` | 43 | Punto de entrada interactivo; impone Goal → aprobación → orquestación; no edita nada |

Frontmatter y permisos por agente (ninguno declara `model:`; el modelo llega por `--model` desde el registro):

| Agente | mode | steps | Permisos relevantes | Invocado por |
|---|---|---|---|---|
| supervisor | primary | 30 | `edit: deny`, `bash: deny`, `task: deny`, `codegen_workflow: allow` | nadie; es `default_agent` |
| goal-manager | primary | 24 | escribe solo `.codegen-goal/**`; no lee `.opencode/codegen/{lib,scripts,config}/**` ni `.opencode/tools/**`; bash solo `git status/log/rev-parse` | `run-goal.mjs:120` |
| planner | primary | 30 | escribe solo `.codegen-plan/**`; mismas denegaciones de lectura; 5 comandos git de lectura | `run-planner.mjs:92` |
| gate-designer | primary | 20 | escribe solo `.codegen-contract/**`; bash: wrapper del gate, unittest, pytest, npm test, node --test | `run-gate-designer.mjs:88` |
| builder | primary | 20 | edita `*` salvo `.opencode/**`, `opencode.json`, `.codegen-contract/**`; bash: `bash .codegen-contract/gate.sh`, `python3 -m unittest*`, `git diff/status` | `run-builder.mjs:116`, `run-builder-smoke.sh:52` |
| researcher | primary | 24 | escribe `.codegen-research/**`; único con `webfetch` y `websearch`; `bash: deny` | `run-researcher.mjs:97` |
| advisor | primary | 20 | escribe `.codegen-opinions/**`; bash `git log/diff/ls-files` | `run-opinions.mjs:160` |
| reconciler | primary | 16 | escribe `.codegen-opinions/**`; `bash: deny` total | `run-opinions.mjs:211`, `certify.mjs:379` |

Los ocho tienen `task: deny`, `question: deny`, `skill: deny`, `model_select: deny`. Con `subagent_depth: 1` el abanico es de un solo nivel, gobernado por Node, no por los modelos.

### Tools (`.opencode/tools/`)

| Archivo | Líneas | Propósito |
|---|---|---|
| `codegen_workflow.js` | 57 | Tool de OpenCode: `draft` / `approve` / `orchestrate`; lanza `node` sobre `run-goal.mjs` u `orchestrate.mjs` |
| `model_select.js` | 52 | Selección de modelo por rol desde el registro; guarda `MAINTENANCE_ONLY` |

`.opencode/commands/` no existe.

### Instrucciones

`instructions/codegen.md` (93): reglas del supervisor, selección de modelos, Goal/Router/Researcher, orquestación, visibilidad, invariante de generación de código. Inyectado por `opencode.json`.

### `lib/` (19 módulos, 3.245 líneas)

| Archivo | Líneas | Propósito |
|---|---|---|
| `agent-run.mjs` | 166 | Abstracción de vista: inline / tmux / wt / vscode; spool; espera del archivo done |
| `artifact-summary.mjs` | 149 | Resúmenes en lenguaje llano de lo que produjo un agente, a partir de los archivos escritos |
| `builder-runner.mjs` | 141 | Plan de ejecución (primario + alterno) por rol; clasifica resultados (saldo Zen/Go, auth, rate limit) |
| `certification.mjs` | 138 | `RELEASE_ROUTE`, admisión por rol, `checkRelease`, `recordCertification` |
| `cli.mjs` | 97 | `parseArguments`, carga de registro, ids de run, detección de manifiesto, git HEAD |
| `derived-work.mjs` | 49 | Router de hallazgos durante build/verify/integrate (direct / contract / new-goal). **Sin llamadas** |
| `display.mjs` | 386 | Renderiza eventos de `opencode run --format json` como transcripción guiada con resumen |
| `final-gate.mjs` | 71 | Reejecuta cada gate sobre la cabeza integrada |
| `gate.mjs` | 78 | `GATE_WRAPPER`, generación del gate, comprobación de baseline |
| `goal-routing.mjs` | 103 | Router determinista: direct / planned / deliberative |
| `goal.mjs` | 258 | Validador de Goal (DRAFT/RESEARCHING/DECIDED/SEALED), `sealApprovedGoal`, render Markdown |
| `model-selection.mjs` | 237 | `ROLES`, ranking de estados, validación de registro, elegibilidad, `selectModel` |
| `opinions.mjs` | 171 | Validadores de opinión/decisión, `reconcileOpinions`, `unanimousDecision` |
| `orchestrator.mjs` | 385 | La corrida entera: Goal → Router → Planner → readiness → oleadas de Builders → cherry-pick → Gate final; `events.jsonl` |
| `plan-validation.mjs` | 239 | Validador de plan: patrones de ruta, solapes, oleadas DAG |
| `process.mjs` | 40 | `runProcess`, primitiva única de procesos hijos |
| `research-report.mjs` | 149 | Validador y render de informes de investigación |
| `run-metrics.mjs` | 62 | `summarizeEvents`: pasos, tokens, coste, texto final, errores |
| `worktrees.mjs` | 126 | Ciclo de vida de worktrees, identidad de commit fija, commit/restore/cherry-pick |

### `scripts/` (13, 2.116 líneas)

| Archivo | Líneas | Propósito |
|---|---|---|
| `agent-view.mjs` | 139 | Corre un agente en su terminal; `--replay`/`--pace` |
| `certify.mjs` | 507 | Certificación: `check` / `status` / `run --role --configuration` |
| `goal.mjs` | 34 | CLI determinista: `validate` / `render` / `route` |
| `orchestrate.mjs` | 83 | Entrada que conecta `orchestrate()` con los tres runners |
| `research.mjs` | 46 | CLI determinista de informes: `validate` / `render` |
| `run-builder-smoke.sh` | 117 | Smoke de un modelo contra `tests/fixtures/builder-basic` |
| `run-builder.mjs` | 212 | Runner del Builder: selección, sello de snapshot, agente, gate |
| `run-gate-designer.mjs` | 151 | Runner del Gate Designer; alcance de escritura a `.codegen-contract/` |
| `run-goal.mjs` | 195 | Runner del Goal Manager (`--intent`) y sello determinista `--approve` |
| `run-opinions.mjs` | 272 | N advisors de familias distintas + reconciler |
| `run-planner.mjs` | 161 | Runner del Planner + validación con clases de trabajo |
| `run-researcher.mjs` | 170 | Runner del Researcher con `OPENCODE_ENABLE_EXA=1` |
| `validate-plan.mjs` | 29 | Validación determinista de plan |

### Esquemas, configuración, raíz

- `schema/`: `goal` (414), `plan` (217), `research-report` (81), `decision` (47), `opinion` (43). JSON Schema 2020-12, solo documentales; `tests/schema-drift.test.mjs` los mantiene alineados con los validadores a mano.
- `config/model-pools.json` (1.966): `schema_version`, `generated_at`, `methodology` (23), `notes` (10), `runner_policies` (7 roles), `routes` (6 clases), `configurations` (36). `config/agent-roles.json` (10).
- `opencode.json` (86): `default_agent: supervisor`, `subagent_depth: 1`, `enabled_providers` (5), listas blancas, `permission.model_select: allow`.
- Raíz: `install.mjs` (215), `package.json` (15 scripts npm), `README.md` (337), `CODE_GENERATION_FLOW.md` (630), `MODEL_SELECTION_SPEC.md` (512), `EVENT_FLOW.md` (215), `GO_CATALOG_ANALYSIS.md` (120), `FLUJOGRAMA_ACTUAL.md` (82), `.gitignore` (6), `.opencode/.gitignore` (4), `.opencode/package.json` (dependencia única `@opencode-ai/plugin@1.18.27`).
- `vscode-extension/`: `extension.js` (183), `install.mjs` (23), `package.json` (0.1.5), `README.md`.

## Anexo B. Grafo de dependencias

Módulos hoja (no importan de `lib/`): `process`, `model-selection`, `run-metrics`, `goal`, `plan-validation`, `research-report`, `opinions`, `artifact-summary`, `derived-work`.

```
process         ← gate, final-gate, worktrees, agent-run, cli
model-selection ← builder-runner, cli, certification
run-metrics     ← builder-runner
goal            ← goal-routing, orchestrator
artifact-summary← display
worktrees       ← final-gate, orchestrator
gate            ← orchestrator
final-gate      ← orchestrator
goal-routing    ← orchestrator
plan-validation ← orchestrator
builder-runner  ← certification
display         ← agent-view.mjs
derived-work    ← nadie (solo su test)
```

Scripts → lib: `orchestrate` (certification, cli, orchestrator, process) · `run-builder` (builder-runner, cli, agent-run, process) · `run-gate-designer` (+ gate, worktrees) · `run-goal` (+ goal-routing, goal, research-report) · `run-planner` (+ plan-validation) · `run-researcher` (+ goal, research-report) · `run-opinions` (+ certification, goal, model-selection, opinions) · `certify` (agent-run, certification, cli, model-selection, opinions, process, run-metrics) · `agent-view` (artifact-summary, display) · `goal.mjs` (goal, goal-routing) · `research.mjs` (research-report) · `validate-plan.mjs` (plan-validation).

Lanzamientos de procesos: `orchestrate.mjs` lanza solo `run-planner`, `run-gate-designer`, `run-builder`. `codegen_workflow.js` lanza `run-goal` (draft, approve) y `orchestrate`. `certify.mjs` lanza los siete runners. `agent-run.mjs` y la extensión lanzan `agent-view.mjs`.

Código muerto o casi: `derived-work.mjs` (solo test); `worktrees.listWorktrees` (solo test); exportaciones `isSymbolicLink`, `selectionView`, `pathPatternsOverlap`, `writtenPreview`, `describeAction`, `VERBS`, `formatNumber` usadas solo internamente o por tests; `scripts/goal.mjs`, `research.mjs`, `validate-plan.mjs` solo por alias npm; `run-researcher.mjs` y `run-opinions.mjs` solo por `certify.mjs` y alias; `run-builder-smoke.sh` solo manual.

Scripts npm que llegan al proyecto instalado (10 de 15): `orchestrate`, `goal:run`, `goal`, `researcher`, `research`, `opinions`, `planner`, `plan:validate`, `gate:design`, `builder`. No llegan: `test`, `install:target`, `certify`, `release:check`.

## Anexo C. Flags de CLI por script

| Script | Flags |
|---|---|
| `orchestrate.mjs` | `--goal --plan --directory --display --run-id --timeout --gate-timeout --concurrency --keep-worktrees --minimum-status` |
| `run-builder.mjs` | `--contract --directory --evidence --risk --timeout --gate-timeout --exclude-family --required-context --work-class --minimum-status --display` |
| `run-gate-designer.mjs` | `--contract --directory --risk --timeout --exclude-family --required-context --work-class --minimum-status --display` |
| `run-goal.mjs` | `--intent --approve --output --reports --directory --risk --timeout --allow-sealed --required-context --minimum-status --display` |
| `run-planner.mjs` | `--goal --objective --output --directory --evidence --risk --timeout --max-contracts --required-context --minimum-status --display` |
| `run-researcher.mjs` | `--question --goal --output --directory --timeout --required-context --minimum-status --display` |
| `run-opinions.mjs` | `--question --goal --advisors --configurations --directory --timeout --required-context --minimum-status --display` |
| `certify.mjs` | `check | status | run`; `--role --configuration --with --display --timeout --minimum-status` |
| `agent-view.mjs` | `<job.json>` o `--replay <events.jsonl> [--pace]` |
| `install.mjs` | `<directorio> [--dry-run] [--skip-validation]` |

## Anexo D. Eventos del orquestador

`GOAL_LOADED, ROUTED, PLAN_REQUESTED, PLAN_GENERATED, PLAN_RETRY, PLAN_VALIDATED, DAG_READY, WAVE_READY, WORKTREE_CREATED, GATE_DESIGN_REQUESTED, GATE_DESIGNED, WAVE_BLOCKED, GATE_READY, BUILDER_DISPATCHED, CONTRACT_PASSED, RETRY, CONTRACT_FAILED, INTEGRATION_CONFLICT, INTEGRATED, WAVE_COMPLETED, FINAL_GATE_STARTED, FINAL_GATE_PASS, FINAL_GATE_FAIL, RUN_COMPLETED, RUN_STOPPED`.

## Anexo E. Tests

107 tests en 23 archivos, `node --test`, sin framework.

| Archivo | tests | Objetivo |
|---|---|---|
| `model-selection.test.mjs` | 12 | model-selection + run-metrics |
| `goal-routing.test.mjs` | 9 | goal-routing |
| `builder-runner.test.mjs` | 9 | builder-runner + `classifyBuilderOutcome` |
| `orchestrator-cli.test.mjs` | 8 | `orchestrate.mjs` extremo a extremo con `opencode` falso |
| `goal-research-cli.test.mjs` | 8 | `run-goal.mjs` + `run-researcher.mjs` |
| `plan-validation.test.mjs` | 6 | plan-validation |
| `goal.test.mjs` | 6 | goal |
| `display.test.mjs` | 6 | display |
| `research-report.test.mjs` | 4 | research-report |
| `opinions.test.mjs` | 4 | opinions |
| `install.test.mjs` | 4 | install.mjs |
| `certification.test.mjs` | 4 | certification + cli |
| `vscode-extension.test.mjs` | 3 | `extension.js` real con `vscode` simulado |
| `opinions-cli.test.mjs` | 3 | `run-opinions.mjs` |
| `gate.test.mjs` | 3 | gate |
| `derived-work.test.mjs` | 3 | derived-work (código muerto) |
| `artifact-summary.test.mjs` | 3 | artifact-summary + display |
| `worktrees.test.mjs` | 2 | worktrees |
| `gate-designer-cli.test.mjs` | 2 | `run-gate-designer.mjs` |
| `agent-run.test.mjs` | 2 | agent-run (inline + tmux) |
| `schema-drift.test.mjs` | 1 | esquemas vs validadores |
| `display-vscode.test.mjs` | 1 | spool vscode |
| `builder-runner-cli.test.mjs` | 1 | `run-builder.mjs` |

Cobertura: 17 de 19 módulos de `lib/` con test directo; `final-gate.mjs` y `process.mjs` solo indirecto. `orchestrator.mjs` tiene una única función con test unitario; el resto solo por los 8 tests de CLI. Sin test: `agent-view.mjs`, `certify.mjs`, `goal.mjs`, `research.mjs`, `validate-plan.mjs`, `run-builder-smoke.sh`; `run-planner.mjs` solo indirecto.

Los tests escriben artefactos reales en `.opencode/codegen/runs/` del harness: 193 de 195 `*.job.json` apuntan a directorios `/tmp/*-test-*` con un `opencode` falso primero en el PATH.

## Anexo F. Evidencia de runs, en detalle

- **Smokes de builder** (`runs/builder-smoke/`, 31 runs, 29 modelos, contrato real `calculator.py`): 24 PASS. Fallos: `opencode/glm-5.3-flash`, `opencode/mimo-v2.5-pro`, `opencode/qwen3.8-flash` (INFRA_ERROR); `openrouter/minimax-m2.5`, `openrouter/moonshotai/kimi-k2.5` (FAIL + INFRA_ERROR). Cuatro runs datan del 2026-09-02, un día antes del primer commit.
- **Certificaciones** (`runs/certification/`, 11 runs, 18:24Z–20:02Z): PASS en advisor, gate-designer, goal-manager (×2), planner (×2), reconciler, researcher, builder; FAIL en `builder/builder-go-minimax-m3/20260903T182404Z-735816` y en un researcher (`20260903T183559Z-752447`), ambos reintentados con éxito.
- **Builder real suelto**: `runs/builder/20260903T035327Z-293617`, directorio `/tmp/codegen-live.7Ls0oX`, `opencode-go/minimax-m2.7`, 6 pasos, 485 tokens de salida, PASS.
- **Orquestación**: no existe `runs/orchestrate/`; el estado vive en `<proyecto>/.codegen-run/<runId>/` y rama `codegen/<runId>` (`orchestrator.mjs:93-94, 197-204, 350-382`). La única evidencia de rama de integración es la aserción del test sobre la rama de fixture `codegen/r1` (`tests/orchestrator-cli.test.mjs:130-144`).
- **`las-viewer-v2`**: run `runs/goal/20260903T225614Z-1010956`, directorio real, `opencode-go/gpt-5.6-luna`, 20 s, 1.065 tokens de salida, `result: DECIDED`, `validation.valid: true`, `routing.status: GOAL_NOT_SEALED`. Goal `count-las-files`, título "Contar archivos LAS bajo data".

## Anexo G. Mapa del repositorio `claude-project-base`

| Directorio | En git | En disco | Qué es |
|---|---|---|---|
| `opencode/` | 111 | 2.809 | implementación OpenCode; 2.734 son artefactos de runs ignorados |
| `adw-hybrid/` | 46 | 46 | ADW híbrido Claude + Codex (`.claude/{agents,hooks,rules,skills}`) |
| `noloop/` | 44 | 48 | ADW v0–v1 con hooks deterministas (`adw-gate.sh`, `adw-stop-gate.sh`), fixture, `run-e2e.sh` |
| `clasico/` | 39 | 39 | método de disciplina rules + skills + agents (blueprint → PLAN.md → fases) |
| `docs/` | 6 | 6 | manuales HTML estáticos |

Solapes concepto a concepto entre `opencode/` y los otros métodos:

- Goal: `adw-hybrid/.claude/skills/goal/SKILL.md`, `noloop/.claude/skills/goal/SKILL.md` (producen `adw/goal.md`) frente a `opencode/.opencode/agents/goal-manager.md` + `schema/goal.schema.json` (`.codegen-goal/goal.json`).
- Plan: `adw-hybrid/.claude/agents/planner.md` frente a `opencode/.opencode/agents/planner.md` + `plan.schema.json` + `plan-validation.mjs`.
- Contrato y Gate: `adw-hybrid/.claude/skills/adw/scripts/dispatch-gate-codex.sh`, `run-gate-e2e.sh` frente a `gate-designer.md` + `gate.mjs` + `final-gate.mjs`.
- Veredictos y opiniones: `adw-hybrid/.claude/agents/{opinion,fusion,verifier}.md` frente a `advisor.md`, `reconciler.md`, `opinions.mjs`.
- Paralelismo y worktrees: `adw-hybrid/.claude/skills/adw/scripts/wave-manager.py`, `noloop/.claude/skills/adw-fanout/` frente a `orchestrator.mjs` + `worktrees.mjs`.

Diferencia de fondo: los tres métodos `.claude/` imponen el flujo con hooks y prosa; `opencode/` con esquemas, un supervisor que no puede editar y certificación por rol.

## Anexo H. OpenCode 1.18.27: capacidades nativas en detalle

Fuentes: CLI local, esquema `https://opencode.ai/config.json`, tipos de `@opencode-ai/plugin` y `@opencode-ai/sdk` 1.18.25, cadenas del binario, documentación en opencode.ai/docs.

**Agentes.** `mode: primary | subagent | all`; claves `model, variant, temperature, top_p, prompt, disable, description, mode, hidden, options, color, steps, permission`. Archivos en `.opencode/agents/*.md` y `~/.config/opencode/agents/*.md`. Integrados: `build, plan, summary, title, compaction` (primary), `explore, general` (subagent). El tool `task` acepta `description, prompt, subagent_type, task_id, command`; `task_id` reanuda la misma sesión de subagente. `background: true` requiere `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`. Cada subagente es una sesión hija con su contexto; profundidad limitada por `subagent_depth` (aquí 1). `opencode run --agent` rechaza subagentes y cae al agente por defecto. No hay traspaso primary → primary ni conceptos de handoff, workflow, fallback o certificación.

**Tools propias.** `.opencode/tools/*.ts|js`; `tool({ description, args, execute(args, ctx) })`; `ctx` = `sessionID, messageID, agent, directory, worktree, abort, metadata({title, metadata}), ask({permission, patterns, always, metadata})`. Retorno `string | {title, output, metadata, attachments}`. Ejecuciones largas sí (async + abort cooperativo); streaming de stdout no, solo `ctx.metadata()` repetido.

**Comandos.** `.opencode/commands/*.md` con `template`, `description`, `agent`, `model`, `variant`, `subtask`. Cuerpo con `$ARGUMENTS`, `$1..$N`, `` !`cmd` ``, `@ruta`. Invocación `/nombre` o `opencode run --command <nombre> -- args`.

**Permisos.** Claves `read, edit, glob, grep, list, bash, task, external_directory, todowrite, question, webfetch, websearch, lsp, doom_loop, skill` (+ `plan_enter`/`plan_exit` en runtime). Valores `ask | allow | deny`, planos o por patrón (`"bash": {"*":"ask","git *":"allow","rm *":"deny"}`). Sobrescribibles por agente. En `opencode run` sin `--auto`, un `permission.asked` se responde `reject` con el mensaje `permission requested: X; auto-rejecting`; no hay prompt interactivo.

**Plugins.** `.opencode/plugins/*.ts`, `~/.config/opencode/plugins/` o paquetes npm. Entrada: `client` (SDK tipado), `project`, `directory`, `worktree`, `serverUrl`, `$`, `experimental_workspace.register`. Hooks: `event` (recibe toda la unión de eventos SSE de todas las sesiones), `config`, `tool`, `auth`, `provider`, `chat.message`, `chat.params`, `chat.headers`, `permission.ask`, `command.execute.before`, `tool.execute.before/after`, `shell.env`, `experimental.chat.messages.transform`, `experimental.chat.system.transform`, `experimental.session.compacting`, `experimental.compaction.autocontinue`, `experimental.text.complete`, `tool.definition`. Eventos: `session.created/updated/deleted/idle/error/status/compacted/diff/share`, `message.updated/removed`, `message.part.updated/removed`, `permission.updated/replied`, `command.executed`, `file.edited`, `file.watcher.updated`, `todo.updated`, `pty.*`, `lsp.*`, `server.connected`, `installation.*`.

**Servidor y SDK.** `opencode serve [--port --hostname --mdns --cors]` (puerto por defecto 0 = aleatorio); la TUI también acepta `--port` y `--hostname`. Auth básica por `OPENCODE_SERVER_PASSWORD`/`USERNAME`. OpenAPI en `GET /doc`; SSE en `GET /event` y `GET /global/event`. Cliente: `global, project, pty, config, tool, instance, path, vcs, session, command, provider, find, file, app, mcp, lsp, formatter, tui, auth, event`. `session.*`: `list, create, status, delete, get, update, children, todo, init, fork, abort, share, diff, summarize, messages, prompt, message, promptAsync, command`. `pty.create/connect/list/get/update/remove`. También `opencode attach <url>`, `export/import`, `web`, `acp`.

**`opencode run`.** Flags: `--command, -c, -s, --fork, --share, -m, --agent, --format default|json, -f, --title, --attach, --dir, --port, --variant, --thinking, -i, --auto`. `--format json` emite NDJSON `{type, timestamp, sessionID, ...}` con `type ∈ {tool_use, step_start, step_finish, text, reasoning, error}`, solo de la sesión raíz. Termina cuando la sesión raíz queda `idle`. Sin `--attach`, levanta un servidor en proceso.

**Sesiones.** SQLite en `~/.local/share/opencode/opencode.db` (tablas `session, message, part, permission, event, todo, project, workspace…`). `opencode db [query] --format json|tsv`, `opencode session list --format json`, `opencode export`, `opencode stats`. Sesiones hijas navegables en la TUI (`session_child_first`, `session_child_cycle`, `session_parent`), en solo lectura ("Subagent sessions cannot be prompted").

**Modelos y proveedores.** `opencode-go` es proveedor integrado (`api: https://opencode.ai/zen/go/v1`, misma `OPENCODE_API_KEY`). `opencode models` lista 461 entradas. Config de proveedor: `npm, api, name, env, whitelist, blacklist, options`; `enabled_providers`/`disabled_providers`; `experimental.policies` con `provider.use`. Un `model` por agente y un `small_model` global. `websearch` nativo solo con proveedor `opencode`/`opencode-go` o `OPENCODE_ENABLE_EXA`/`OPENCODE_ENABLE_PARALLEL`.

**Novedades 1.18.x relevantes.** `task_id`, subagentes en segundo plano (experimental), `session.promptAsync`, `session.fork`/`--fork`, API de PTY, SQLite + `opencode db`, `experimental.batch_tool`, `primary_tools`, `continue_loop_on_deny`, `policies`, `skills`, `references`, `compaction {auto, prune, tail_turns}`, adaptadores `experimental_workspace`, `attach`/`acp`/`web`.

## Anexo I. Configuraciones del registro

36 configuraciones en `model-pools.json`: 13 `opencode-go`, 13 `opencode`, 9 `openrouter`, 1 `ollama`. Estado de catálogo: 33 `candidate`, 3 `watch`; todas `enabled`. Ruta certificada por rol (todo OpenCode Go): `gpt-5.6-luna` = goal-manager, planner (primario), researcher, advisor; `glm-5.3` = goal-manager y planner alternos; `minimax-m3` = builder y reconciler; `mimo-v2.5-pro` = gate-designer (familia distinta del builder); `deepseek-v4-pro` = advisor. `checkRelease` sobre el registro actual: `ok: true`, `builder_family: minimax`, `missing: []`.

