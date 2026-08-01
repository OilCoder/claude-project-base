# claude-project-base — dos métodos de generación de código

Este repo contiene **dos métodos de generación de código con Claude Code**, cada uno
autocontenido en su propia carpeta con su `.claude/` adentro — porque así funciona
Claude: el método vive en la carpeta `.claude/` del proyecto donde trabaja.

```
clasico/
└── .claude/          ← método CLÁSICO: rules + skills + agents + hooks de disciplina
    ├── skills/       (/checkpoint, /blueprint, /plan-writing, /phase-executor, ...)
    ├── agents/       (architect, implementer, code-reviewer, ...)
    ├── rules/        (13 reglas: code-style, verification, planning-format, ...)
    ├── hooks/        (statusline, session-start, stop-suggest-checkpoint, ...)
    └── settings.template.json

noloop/
└── .claude/          ← método NO-LOOP (ADW): la estructura impone, la memoria no
    ├── hooks/        (adw-detect, adw-gate, adw-stop-gate, adw-posttool-lint)
    ├── settings.json / settings.template.json
    ├── referencias/  (diagramas del método, investigación, transcripción)
    ├── fixture-project/  (banco de pruebas con errores deliberados)
    ├── run-e2e.sh    (verificación end-to-end con claude -p real)
    └── adw-gates.conf.example
```

## Filosofías

- **Clásico**: las reglas y skills *guían* al agente — disciplina de planeación
  (blueprint → PLAN.md → fases), bitácora, checkpoint. El agente recuerda verificar.
- **No-loop (ADW)**: los gates deterministas *imponen* el flujo — hooks que no dejan
  al agente terminar su turno con lint/tests rotos (exit 2 le devuelve los errores:
  el "fail: loop back" de los diagramas en `noloop/.claude/referencias/`). El humano
  aparece solo en los extremos: prompt y review.

## Usar un método en un proyecto

Copiar el `.claude/` del método al proyecto destino:

```bash
cp -r clasico/.claude  /ruta/al/proyecto/.claude   # o
cp -r noloop/.claude   /ruta/al/proyecto/.claude
```

(Para no-loop: renombrar `settings.template.json` a `settings.json` en el destino y,
opcionalmente, definir los gates en `adw-gates.conf`; sin él se autodetectan —
Python → ruff/pytest, JS → eslint/prettier. Para el clásico: correr `/setup`.)

También puedes abrir Claude directamente dentro de `clasico/` o `noloop/` para
trabajar sobre el método mismo.

## Verificar el método no-loop

```bash
bash noloop/.claude/run-e2e.sh
```

Copia el fixture a /tmp, instala el método, corre un `claude -p` real y muestra el log
de gates (`.claude/adw-runs/*.jsonl`) con la secuencia fail → loop-back → pass.

## Progresión del método no-loop (v0 → v4)

- **v0 (hecho)** — gate de lint que bloquea el turno (diagrama 1)
- **v1 (hecho)** — cadena lint → format → test (diagramas 2-3)
- **v2** — Test Agent con contexto fresco (diagrama 4)
- **v3** — Planner al frente + escalamiento de fallos (diagrama 5)
- **v4** — fan-out a N worktrees en paralelo (diagrama 6)
