# Investigación: primitivas oficiales para programar ADWs

Fuente: documentación oficial de Claude Code (code.claude.com/docs) y Agent SDK,
investigada 2026-07-15. Base para el sistema de AI Developer Workflows de la rama
`enfoque/nuevo`.

## Mapa: nodo del diagrama → primitiva oficial

| Nodo (imágenes 1-6) | Primitiva | Detalle |
|---|---|---|
| Build/Planner/Test Agent | Agent SDK `query()` (Python: `claude-agent-sdk`) | Un agente = una llamada con `ClaudeAgentOptions` propias |
| `fail: loop back` (mismo contexto) | `resume=session_id` | El `session_id` viene en el `ResultMessage`; re-prompteas con los errores y el agente conserva todo su contexto |
| Rombos verdes (lint/format/test) | `subprocess` normal de Python | Los gates NO son agentes: código determinista que produce un veredicto |
| Veredictos entre nodos | `output_format={"type": "json_schema", ...}` | Salida JSON validada (Pydantic → `model_json_schema()`); reintenta solo si no cumple el esquema |
| Fan-out a worktrees | `git worktree add` + `cwd=` por agente | Cada `query()` acepta `cwd`; también existe `claude --worktree` en CLI y `isolation: worktree` en subagentes |
| Guardrails por nodo | `allowed_tools` / `disallowed_tools` / `permission_mode` | Planner: solo lectura (`Read,Glob,Grep`); Builder: `+Edit,Write,Bash`; modo `dontAsk` para headless bloqueado |
| Frenos económicos | `max_turns` + `max_budget_usd` | Por nodo; el `ResultMessage` trae `total_cost_usd` |
| Hooks programáticos | `hooks={"PreToolUse": [HookMatcher(...)]}` | Callbacks Python en el orquestador, sin settings.json |

## Claves del SDK (Python)

- Paquete: `claude-agent-sdk` (Python 3.10+). `uv add claude-agent-sdk`.
- Patrón one-shot: `async for message in query(prompt, options)` → capturar
  `ResultMessage` (`.session_id`, `.result`, `.structured_output`, `.total_cost_usd`,
  `.subtype`: `success` / `error_max_turns` / `error_max_budget_usd`).
- Multi-turno automático: `ClaudeSDKClient` (mantiene la sesión entre `client.query()`).
- Fork de sesión: `resume=id, fork_session=True` — explorar alternativa sin tocar la original.
- Subagentes en el mismo run: `agents={"name": AgentDefinition(description, prompt, tools, model)}`
  — para contexto aislado dentro de un run; para nodos del pipeline conviene runs
  top-level separados (control total del enrutamiento desde código).
- Paralelismo: `asyncio.gather()` con `cwd` distinto por agente. ~1 GiB RAM por sesión
  como punto de partida (cada sesión es un subproceso `claude`).

## Claves del CLI headless (alternativa bash)

- `claude -p "prompt" --output-format json` → `jq -r '.session_id' / '.result' / '.total_cost_usd'`.
- Reanudar: `claude -p "errores..." --resume "$session_id"`.
- Skills funcionan headless: `claude -p "/code-review" --resume "$id"`.
- `--bare` para CI determinista (ignora ~/.claude y .claude/ del proyecto).
- `claude --worktree nombre` crea worktree en `.claude/worktrees/<nombre>/`;
  `.worktreeinclude` copia archivos gitignorados (.env) a cada worktree.
  Ojo: con `-p` el worktree NO se auto-limpia.

## Mejores prácticas oficiales que validan los diagramas

1. **Explore → Plan → Code → Commit** es el workflow recomendado por Anthropic —
   exactamente Planner → Builder del diagrama 5 (plan mode para explorar sin editar).
2. **Verificación como checkpoint**: sesiones exitosas tienen gates verificables
   (tests, commits, confirmación). Hooks `Stop` con exit 2 bloquean hasta que pase
   (tope: 8 bloqueos consecutivos).
3. **Writer/Reviewer con contextos separados**: un agente escribe, otro con contexto
   fresco revisa — menos sesgo. Valida separar Test Agent del Build Agent.
4. **Humano decide QUÉ, agente decide CÓMO** (investigación Anthropic 2026: ~70% de
   decisiones de planeación son humanas, ~80% de ejecución del agente) — las dos
   constraints del video (prompt y review en los extremos).
5. **Contexto magro**: CLAUDE.md mínimo, subagentes para exploración ruidosa,
   `/clear` tras 2 correcciones fallidas.
6. Exit codes de hooks: `0` = ok (stdout → contexto solo en SessionStart/UserPromptSubmit),
   `2` = bloquea (stderr → feedback al agente), otro = error no bloqueante.

## Decisión de arquitectura propuesta

**Python + `claude-agent-sdk`** como orquestador (stack primario del usuario), no bash:
- control de flujo real (retries, veredictos tipados con Pydantic, asyncio para fan-out)
- hooks y gates en el mismo lenguaje
- testeable: cada nodo del pipeline es una función que se puede probar aislada

Progresión de construcción (= progresión de los diagramas):
1. `v0`: loop lint (diagrama 1) — builder + gate lint + resume on fail
2. `v1`: gates encadenados lint→format→test (diagramas 2-3)
3. `v2`: Test Agent que interpreta veredictos (diagrama 4)
4. `v3`: Planner al frente + review humano con escalamiento de fallos (diagrama 5)
5. `v4`: fan-out a N worktrees + merge (diagrama 6)

## No verificado / pendiente

- Timeout wall-clock por agente en el SDK (solo existe `max_turns`) — mitigar con
  `asyncio.wait_for` en el orquestador.
- Detalles del retry de structured output ante fallo de esquema.
