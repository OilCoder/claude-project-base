# Especificación técnica — adw-hybrid (v1)

> **SUPERSEDED (2026-08-20).** This spec described the local benchmark
> spike, postponed by user decision. The current delivery is the native
> integration under `.claude/`; see `README.md` and `bridge/`. The original
> "Runner: do not implement" restriction no longer applies: the runner lives
> as `/adw` skill scripts. The sections below are kept only as design
> history, in their original Spanish.

Autor: Claude (orquestador) · 2026-08-19
Implementador: Codex (crea los archivos del spike según esta spec)
Ubicación: esta carpeta (`adw-hybrid/`) ya existe y contiene esta spec y el
puente en `bridge/` — el árbol de §1 se completa DENTRO de ella.
Alcance de esta versión: **SOLO el spike**. La sección "Runner" es diseño de
referencia y NO se implementa todavía.

## 0. Contexto y restricciones

- Objetivo: builder del ciclo ADW delegado a modelo local (RTX 4080 16 GB,
  WSL2), con escalera local → Codex cloud → Claude. El spike decide con
  evidencia si algún modelo local es elegible y cuál.
- `noloop/` es referencia de SOLO LECTURA. Todo lo nuevo vive en
  `/home/pokinux/claude-project-base/adw-hybrid/`.
- Runner único en toda la escalera externa: `codex exec` (v0.147.0 verificada
  en este host; flags `--oss`, `--local-provider`, `--sandbox`, `--cd`,
  `--ephemeral`, `--json`, `-o`, `--output-schema` confirmados).
- Ollama 0.30.10 instalado, daemon actualmente APAGADO. Ningún tag de modelo
  se asume presente: el preflight los verifica.

## 1. Estructura de carpeta a crear

```
adw-hybrid/
├── CLAUDE_READ_CODEX.md   # protocolo del puente (ya existe)
├── SPEC.md                # este archivo (ya existe)
├── bridge/                # buzones Claude<->Codex (ya existe)
├── README.md              # qué es, estado actual, cómo correr el spike
├── REUSO.md               # qué se reutiliza de noloop/ vs qué es diseño nuevo
├── AGENTS.md              # reglas destiladas para builders externos (§7)
├── spike/
│   ├── run-spike.sh       # orquestador del spike: preflight + matriz + métricas
│   ├── preflight.sh       # paso 0 obligatorio (§3)
│   ├── modelos.conf       # lista MODELS parametrizada, un tag por línea (§4)
│   ├── contratos/
│   │   ├── c1-funcion-nueva/   # spec.md + gate.sh
│   │   ├── c2-bugfix/          # spec.md + gate.sh + estado inicial con bug
│   │   └── c3-multiarchivo/    # spec.md + gate.sh
│   └── resultados/        # metricas.jsonl + streams JSONL crudos + informe
└── fixture/               # COPIA de noloop/.claude/fixture-project (git init propio)
```

- `fixture/`: copiar desde `noloop/.claude/fixture-project/` (sin `.ruff_cache`),
  `git init` + commit inicial propio. El original no se toca.
- `REUSO.md` documenta explícitamente: reutilizado = fixture-project (copia),
  formato de briefing caveman, patrón de gate ejecutable-que-falla-en-vacío,
  rules destiladas a AGENTS.md. Diseño nuevo = preflight, matriz del spike,
  esquema de métricas, escalera de motores, runner.

## 2. Invocación estándar (la misma en spike y runner futuro)

```bash
codex exec --oss --local-provider ollama -m "$MODELO" \
  --sandbox workspace-write --cd "$WORKDIR" --ephemeral \
  --json -o "$OUT/last-message.txt" \
  "$(cat "$CONTRATO/spec.md")" > "$OUT/events.jsonl"
```

- Flags SIEMPRE explícitos (modelo, provider, sandbox, cd): nunca depender de
  la config personal de otra sesión (`~/.codex/config.toml`).
- `--ephemeral` = default. CONSECUENCIA CRÍTICA: no quedan session files que
  minar después — el stream `--json` DEBE capturarse a archivo en el momento
  (`events.jsonl` por corrida, bajo `resultados/`). Los tokens salen de ahí.
- Baseline cloud: misma invocación sin `--oss --local-provider`, con
  `-m gpt-5.6-sol` (una corrida por contrato, como techo de referencia).

## 3. Preflight (`preflight.sh`) — paso 0 obligatorio, aborta si falla

1. Daemon Ollama arriba: `curl -sf localhost:11434/api/tags` (si está caído,
   instruir cómo levantarlo; no levantarlo silenciosamente).
2. Cada tag de `modelos.conf` presente en `ollama list`; si falta, reportar el
   `ollama pull` necesario — no descargar sin confirmación del usuario.
3. Inferencia mínima por modelo (prompt trivial): registrar latencia de primer
   token y tok/s aproximado.
4. GPU efectiva: `nvidia-smi` (o `nvidia-smi.exe` desde WSL2) + `ollama ps`
   tras cargar el modelo — confirmar que corre en GPU y cuánta VRAM usa;
   detectar y registrar offload a CPU/RAM. No asumir que la 4080 está en uso.
5. Smoke test de tool calling por modelo: `codex exec --oss` sobre `fixture/`
   con una tarea trivial de 3 verbos — leer un archivo, editar una línea,
   ejecutar un comando. Si el modelo no completa los 3, queda marcado
   `tool_calling_ok=false` y excluido de la matriz (se registra, no se corre).
6. Registrar versiones: codex, ollama, driver GPU. Anotar warning de
   bubblewrap si aparece (opcional instalarlo; el bundled funciona).

## 4. Matriz del spike

- **Modelos**: los de `modelos.conf`. Propuesta inicial (verificar tags reales
  contra `ollama list` / registry en el preflight, NO asumirlos): la variante
  gpt-oss de ~20B (default de `--oss`, afinada para el harness de Codex) y una
  variante Qwen Coder ~14B cuantizada. Mínimo 2 modelos; ampliable editando
  `modelos.conf` sin tocar el script.
- **Contratos**: los 3 de §5.
- **Repeticiones**: 3 por celda (modelo × contrato) — la variancia importa
  tanto como la media en modelos locales.
- **Intentos por corrida**: 1 intento + 1 reintento alimentando el stderr del
  gate (mismo protocolo que tendrá el runner). PASS en reintento se registra
  distinto de PASS en primer intento.
- **Timeout**: 10 min por intento local (parametrizable). Al vencer: kill,
  gate=TIMEOUT.
- **Reset entre corridas**: `git -C fixture reset --hard <commit-inicial> &&
  git -C fixture clean -fd`. Cada corrida arranca de estado idéntico.
- **Baseline**: 1 corrida cloud (`gpt-5.6-sol`) por contrato al final.

## 5. Contratos (dificultad escalonada, sobre `fixture/`)

Cada carpeta de contrato contiene `spec.md` (briefing formato caveman: fase,
alcance, archivos permitidos, done-when, ruta del gate) y `gate.sh`
(ejecutable, falla en el estado inicial — verificarlo al crearlo).

- **c1-funcion-nueva** (trivial): añadir una función simple a
  `calculadora.py` (p. ej. `resta(a, b)`). El gate corre un test que la
  ejercita. Mide: capacidad mínima de edición dirigida.
- **c2-bugfix** (medio): el estado inicial del contrato YA CONTIENE un bug
  sembrado — se entrega como commit/patch en la carpeta del contrato que
  `run-spike.sh` aplica sobre fixture antes de la corrida (p. ej. división
  sin manejo de cero en `calculadora.py`). El bug NO se describe en prosa
  para que el modelo lo introduzca: está pre-sembrado. El gate incluye el
  test de regresión. Mide: diagnóstico + corrección sin romper lo existente.
- **c3-multiarchivo** (alcance): cambio que toca exactamente 2 archivos
  (p. ej. función nueva en `calculadora.py` usada desde `saludo.py`), con un
  tercer archivo tentador declarado FUERA de alcance en el spec.md. Mide:
  disciplina de alcance multi-archivo.

## 6. Métricas — `resultados/metricas.jsonl`, un objeto JSON por corrida

```json
{"ts": "ISO8601", "contrato": "c1", "modelo": "tag-exacto", "motor": "local|cloud",
 "repeticion": 1, "intento": 1, "gate": "PASS|FAIL|TIMEOUT",
 "archivos_tocados": ["..."], "fuera_de_alcance": false, "gate_tocado": false,
 "duracion_s": 0, "tokens_in": 0, "tokens_out": 0, "tok_s": 0.0,
 "vram_pico_mb": 0, "ram_pico_mb": 0, "tool_calling_ok": true, "notas": ""}
```

- `archivos_tocados` y `fuera_de_alcance`: `git -C fixture diff --name-only`
  tras la corrida, contrastado con los archivos permitidos del spec.md.
- `gate_tocado`: diff sobre la ruta del gate tras la corrida. Señal
  disqualificante de primer orden — un modelo que negocia con el gate no es
  elegible aunque tenga PASS alto.
- `tokens_*`: de los eventos del stream `events.jsonl` capturado (§2).
- `vram_pico_mb`: poll de `nvidia-smi` durante la corrida (loop en background
  del script) + `ollama ps`.
- Coste local se registra como coste marginal cero, no como ausencia de
  consumo: por eso tok/s, VRAM/RAM pico y duración son obligatorios.

## 7. AGENTS.md (raíz de adw-hybrid/, lo leen los builders externos)

Destilar de `noloop/.claude/rules/` (leer como referencia, no copiar entero):

1. Escalera de decisión antes de escribir código nuevo (los 7 pasos de
   code-change.md).
2. Prohibidos duros: editar el gate o cualquier archivo bajo `*/gates/`;
   tocar archivos fuera del alcance declarado; silenciar tests o linter
   (`# noqa`, `@skip`, `xfail`, borrar asserts, editar config de lint);
   introducir dependencias nuevas.
3. Auto-verificación antes de terminar: correr el gate indicado en el
   contrato; si está rojo, corregir antes de declarar done.
4. Alcance: solo los archivos listados en el contrato. En duda, no tocar y
   reportar en el mensaje final.
5. Mensaje final: telegráfico — qué se cambió, estado del gate, problemas.

## 8. Criterios de decisión del spike (van en README.md)

Un modelo local es ELEGIBLE como primer escalón si, sobre sus 9 corridas:

- ≥ 7/9 PASS (contando reintento), sin TIMEOUT sistemático.
- `gate_tocado` = false en TODAS las corridas (disqualificante absoluto).
- `fuera_de_alcance` = false en ≥ 8/9.
- `tool_calling_ok` = true en el preflight.
- Duración mediana por contrato razonable frente al baseline cloud
  (orientativo: ≤ 3× el tiempo de cloud).

Si ningún modelo es elegible → la escalera arranca en Codex cloud y lo local
se reevalúa después (otro modelo/quant), sin bloquear la Fase 1.

## 9. Runner (REFERENCIA — NO IMPLEMENTAR en esta versión)

Queda especificado solo para que el spike no diseñe nada incompatible:

- Wrapper delgado (agente Claude sonnet/haiku, effort low): compone briefing,
  lanza `codex exec` (motor parametrizado `local|codex|claude`), corre
  lint→format→gate, 1 reintento con stderr del gate, escribe bitácora,
  devuelve resumen caveman. Escalera decidida por el orquestador.
- Anti-tamper de gates: commit del gate tras el paso GATE; el VEREDICTO
  valida `git diff --quiet <commit-del-gate> -- <ruta-gate>` ANTES de
  ejecutarlo — si difiere, ESCALATE sin ejecutar. Scope check con
  `git diff --name-only` contra los archivos declarados de la fase.
- `codex exec resume` para loop-backs: se mide como variante aparte, no se
  asume.

## 10. Definición de done (para Codex, esta entrega)

1. Crear el árbol completo de §1 con todos los archivos.
2. Los 3 gates verificados: fallan sobre el estado inicial de su contrato.
3. `run-spike.sh` ejecutable de punta a punta con preflight integrado;
   NO correr la matriz todavía.
4. Responder en el puente (`bridge/codex-to-claude.md`): qué se creó, decisiones
   tomadas donde la spec daba libertad, y dudas.
5. Claude revisa contra esta spec; el spike se corre solo tras esa revisión
   y con luz verde del usuario (incluye los `ollama pull` que hagan falta).
