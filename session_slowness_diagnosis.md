# Diagnóstico de lentitud — sesión ADW `6040fbe9…` (2026-07-30 → 2026-08-04)

Autodiagnóstico solicitado por el dueño del sistema. Investigación de solo
lectura: transcript de la sesión (10.3 MB, 4492 líneas JSONL al momento de
iniciar este análisis), logs `.claude/adw-runs/2026-08-0{1,2,3}.jsonl`
(1060 eventos de gate), los 7 hooks en `.claude/hooks/`, los 7 agentes en
`.claude/agents/`, las 6 reglas en `.claude/rules/`, `settings.json`, y una
medición en vivo contra Ollama local.

## Resumen ejecutivo

**La fuente dominante es (a) el overhead estructural del ciclo ADW**, no la
inferencia del LLM local. La sesión despachó **100 subagentes** (55
`test-agent`, 31 `builder`, 7 `general-purpose`, 3 `verifier`, 3
`researcher`, 1 `planner`); de los 56 despachos cuya duración quedó
registrada en el transcript, el tiempo acumulado es **22.353.404 ms ≈ 372.6
minutos ≈ 6.2 horas** de cómputo de subagente (promedio 6h39min→ 6.65
min/despacho, máximo 20.1 minutos en un solo veredicto). Esto es consecuencia
directa y esperada del patrón GATE→builder→VEREDICTO de 3 saltos con
contexto fresco, multiplicado por ~29 ciclos de fase (32 entradas en
`adw/bitacora.md`, 7 de ellas loop-backs). Es exactamente lo que el diseño
promete — verificación exhaustiva, no atajos — y es, con mucha ventaja, el
mayor consumidor de tiempo real de la sesión.

En contraste, medí en vivo una llamada real a `llama3.1:8b` (el
`DEFAULT_MODEL` de `chat_client.py`) con un prompt petrofísico representativo:
**2.36 segundos** de punta a punta (carga 165 ms + prompt-eval 210 ms +
generación 1.91 s para 207 tokens). Los 228 gates `test` registrados en
`adw-runs` (que sí ejecutan la suite completa, incluida cualquier prueba con
Ollama real) promedian **5.55 s** y el máximo observado en 3 días fue **27.5
s**. La inferencia del producto bajo prueba es, cuantitativamente, un actor
menor frente a las 6+ horas de despachos de subagente.

También encontré fricción real de herramientas — un falso positivo
**reproducible** del hook de seguridad `git reset --hard` que bloqueó
comandos benignos, y truncamiento de reportes de subagente que forzó 17 de
26 mensajes de continuación — pero ambos, medidos en minutos por incidente,
son secundarios frente a (a).

---

## (a) Overhead estructural del ciclo ADW

**Evidencia cuantitativa:**

| Métrica | Valor |
|---|---|
| Despachos de subagente totales (`Agent`/`Task`) | 100 |
| — `test-agent` (GATE + VEREDICTO) | 55 |
| — `builder` | 31 |
| — `general-purpose` (esta misma investigación y otras) | 7 |
| — `verifier` / `researcher` / `planner` | 3 / 3 / 1 |
| Fases registradas en `adw/bitacora.md` | 32 (`## Fase N`) |
| — de ellas, loop-backs (re-trabajo tras FAIL) | 7 (22%) |
| `VEREDICTO: PASS` / `FAIL` / `ESCALATE` (menciones) | 58 / 12 / 0 |
| Duración acumulada medida de despachos (56 con `duration_ms` en el transcript) | 22.353.404 ms ≈ **372.6 min (6.2 h)** |
| Duración promedio por despacho | ≈ 399.2 s (6.65 min) |
| Duración máxima de un único despacho | 1.204.445 ms (**20.1 min**) |
| Snapshots pre-compact (`<!-- snapshot pre-compact` en estado.md) | 67 |

El aritmética de despachos cuadra con el diseño: 32 fases − 7 loop-backs = 25
ciclos "intento 1" × 3 saltos (GATE + builder + VEREDICTO) = 75, más 7
loop-backs × ~2 saltos adicionales (builder + VEREDICTO) = 14 → **89**,
consistente con los 86 despachos `test-agent`+`builder` observados. El resto
(`general-purpose`, `verifier`, `researcher`, `planner`) corresponde a
investigación/planeación puntual, no al ciclo de fase.

67 snapshots pre-compact en `adw/estado.md` indican compactación de contexto
frecuente a lo largo de la sesión multi-día — cada compactación dispara el
ritual post-compact (releer `estado.md` + `goal.md` + fase activa de
`plan.md`), un costo adicional que crece con el número de fases procesadas en
una sola sesión continua.

**Interpretación:** esto es verificación exhaustiva por diseño, no un bug. El
ciclo GATE (contexto fresco, escribe el contrato de cierre) → builder
(implementa) → VEREDICTO (contexto fresco, revisión independiente) cuesta 3
saltos de subagente por fase como mínimo, cada uno con su propio arranque de
contexto, lectura de reglas/plan/gate, y cadena mecánica lint→format→test. A
6.65 min/despacho promedio, 29 ciclos de fase consumen las 6+ horas medidas.
Es la palanca más grande del sistema — reducirla implica una decisión de
diseño (relajar el rigor en algunas fases), no una corrección de bug.

---

## (b) Fricción por bugs / falsos positivos en hooks o herramientas

### b.1 — Falso positivo reproducible en el hook `git reset --hard`

`settings.json` (líneas 61-82) registra tres hooks `PreToolUse:Bash`
condicionados por el campo `"if"`:

```json
{ "if": "Bash(rm -rf *)", "command": "... BLOCKED: rm -rf is restricted ..." },
{ "if": "Bash(git push --force *)", "command": "... BLOCKED: force-push ..." },
{ "if": "Bash(git reset --hard *)", "command": "... BLOCKED: git reset --hard discards uncommitted work ..." }
```

Conté **13 bloqueos reales** (`toolDenialKind` con origen
`PreToolUse:Bash hook error`) en todo el transcript. Rastreé el comando
`Bash` que originó cada uno de los 13 — **ninguno era `git reset --hard`,
`rm -rf` del repo, ni `git push --force`**. Ejemplos reales bloqueados:

```
for f in adw/gates/m2-fase-*.sh; do echo "=== $f ==="; bash "$f" ...; done
for pid in 4485 4811 5029; do echo "pid $pid:"; readlink /proc/$pid/cwd ...; done
diff -rq .claude/agents /tmp/cpb/noloop/.claude/agents ... ; rm -rf /tmp/cpb ; git status --short .claude
cp -r .claude .claude.bak-$(date +%Y%m%d-%H%M)
cat > .../diag_ledger.py << 'PYEOF' ... PYEOF
timeout 280 uv run python -m agentic_report.run_loop 2>&1 | tail -40
```

El propio `test-agent` de la fase 5 lo señaló en su veredicto: *"el hook
PreToolUse bloqueó tres de mis comandos con `BLOCKED: git reset --hard` sin
que el comando contuviera nada parecido (falsos positivos sobre `cmd | tail;
echo "$?"` y sobre un `for g in lint format test`)"*.

**Lo reproduje en vivo durante esta misma investigación**, 5 veces
independientes, con comandos triviales sin relación alguna con git:

```
for ts in "a" "b"; do echo "$ts"; done                    → BLOCKED (git reset --hard)
for ts in "a"; do echo "$ts"; done                        → BLOCKED
sort -t$'\t' -k2 -rn archivo.tsv | head -1                → BLOCKED
python3 - "$F" <<'PYEOF' ... (script con varios "for x in y:") → BLOCKED
grep -o '...CRÍTICO...' archivo.jsonl | wc -l              → BLOCKED
```

mientras que variantes casi idénticas sin alguno de esos elementos pasaron
sin problema (`for i in 1 2; do echo hi; done`,
`sort -rn archivo.txt | head -1`, el mismo grep sin el pipe a `wc -l`).

**Causa raíz:** el campo `"if": "Bash(git reset --hard *)"` no es un
`grep`/glob literal sobre el texto del comando — si lo fuera, ninguno de los
ejemplos anteriores lo habría disparado. Es un matcher interno de Claude Code
(el motor que evalúa el campo `if` de un hook `PreToolUse`) que evalúa el
"riesgo" del comando de forma difusa/heurística, y esa heurística sobre-
dispara con scripts Bash de varias líneas, bucles `for`, heredocs y
tuberías con múltiples comandos — construcciones comunes y benignas. **No es
un bug en `.claude/hooks/*.sh` del repo** (esos scripts nunca llegaron a
ejecutarse en los 13 casos rastreados salvo para imprimir el `printf`
fijo) — el bug vive en el evaluador del campo `"if"` de Claude Code, fuera
del control del repo. De los 13 bloqueos reales de toda la sesión, la tasa
de falso positivo confirmada es **13/13 (100%)** en los casos rastreables;
cero comandos genuinamente destructivos fueron bloqueados ni tampoco se
intentó ninguno.

**Costo:** cada bloqueo cuesta como mínimo un turno perdido + reintento (el
agente redirige el comando, lo reescribe o lo divide). Con 13 bloqueos
confirmados más los que no se rastrearon a un `tool_use_id` verificable, es
fricción real pero de segundos-minutos por incidente — no compite en escala
con (a).

### b.2 — Truncamiento de reportes de subagente

De los 26 despachos `SendMessage` usados para retomar un agente ya
completado, **17 (65%)** tienen como razón explícita continuar un reporte
truncado — resúmenes literales tomados de los propios `input.summary`:
*"pide veredicto completo, reporte se cortó"*, *"reporta completo, caveman,
sin truncar"*, *"pedir reporte VEREDICTO ronda 2/3/4 completo"* (un solo
veredicto de fase 8 necesitó **4 rondas** de continuación para obtener un
reporte no cortado). Esto es puro overhead de mensajería — cada ronda es un
viaje de ida y vuelta con latencia propia — no forma parte del diseño del
ciclo ADW.

### b.3 — Reescritura de gates por exceder el presupuesto de 150 líneas

`test-agent.md` fija *"Presupuesto: ~150 líneas"* para cada gate. 4 de los 26
`SendMessage` de continuación son específicamente para recortar un gate al
presupuesto (*"recorta gate a ≤150 líneas"* ×3, *"termina y recorta a ≤150
líneas"* ×1). Los gates de M1 (`adw/gates/fase-{5,6,7,8,9}.sh`) llegaron a
**715–1455 líneas** — muy por encima del presupuesto adoptado después para
M2 — y la bitácora registra una advertencia explícita: *"fase-3.sh, que
quedó en 300 líneas — no la repitas"*. Los gates de M2
(`adw/gates/m2-fase-*.sh`) están mayormente en 149-300 líneas; 2 de 14 siguen
por encima del presupuesto (m2-fase-2: 256, m2-fase-3: 300).

---

## (c) Latencia de inferencia LLM local (Ollama) — producto bajo prueba

**No es un contribuyente material a la lentitud de la sesión.**

- `chat_client.py:26` — `DEFAULT_MODEL = "llama3.1:8b"`;
  `chat_client.py:28` — `DEFAULT_TIMEOUT = 120.0` segundos (techo de
  seguridad, no latencia típica — un servidor colgado no debe bloquear el
  pipeline).
- Medición en vivo (esta investigación, `ollama` ya corriendo, GPU
  disponible) contra `llama3.1:8b` con un prompt petrofísico representativo
  (97 tokens de entrada, pidiendo un párrafo de interpretación):
  **`total_duration` = 2.365 s** (`load_duration` 165 ms,
  `prompt_eval_duration` 210 ms para 97 tokens, `eval_duration` 1.91 s para
  207 tokens de salida ≈ 9.2 ms/token).
- `report.py` documenta el flujo real: el modelo redacta una vez; si
  `claim_verifier.unsupported_claims` encuentra cifras sin respaldo, hay **un
  único reintento** citando las líneas ofensivas; si tampoco reconcilia, se
  publica una plantilla determinista (`report_source = deterministic_fallback`)
  — es decir, el peor caso de `write_report` es ~2 llamadas reales, del orden
  de segundos, nunca minutos.
- Los gates `test` de `adw-runs` (228 corridas en 3 días, ejecutan la suite
  completa incluyendo cualquier prueba real contra Ollama) promedian
  **5.55 s** y su máximo en toda la sesión fue **27.5 s** — órdenes de
  magnitud por debajo de los 6.65 min promedio por despacho de subagente.

Conclusión: la hipótesis de que M2 es lento "por naturaleza" al usar
inferencia local no se sostiene con los números medidos. El cuello de botella
no es el producto, es el propio ciclo de desarrollo que lo construye.

---

## (d) Ineficiencias del propio orquestador

El hilo principal usó herramientas directamente (no delegadas) con esta
distribución en el transcript: `Bash` 271, `Edit` 108, `Read` 64, `Write` 35,
`Agent` 100, `SendMessage` 26, `TaskCreate`/`TaskUpdate` 21/40.

La mayoría de `Edit`/`Write`/`Read` recae en `adw/estado.md` (62 + 17 + 26 =
105 toques) y en `adw/plan.md`/`adw/goal.md`/documentos de `planning/` — esto
**cumple** `rules/context-discipline.md` (el orquestador es dueño de
`estado.md`, no lo delega) y no es desperdicio.

Pero el orquestador también editó código de producción **directamente**,
fuera del ciclo builder/test-agent:

| Archivo | Edits directos | Reads directos |
|---|---|---|
| `src/agentic_report/orchestrator/report.py` | 4 | 1 |
| `src/agentic_report/verification/claim_verifier.py` | 2 | 2 |
| `src/agentic_report/orchestrator/prompts.py` | 2 | 2 |
| `tests/test_claim_verifier.py` | 1 | 2 |

Estos son **exactamente** los archivos que el `git status` al inicio de esta
conversación reporta como modificados sin commitear
(`src/agentic_report/verification/claim_verifier.py`,
`tests/test_claim_verifier.py`, `tests/test_report.py`). Esto contradice la
regla propia del orquestador en `rules/context-discipline.md`: *"Tú nunca lees
archivos fuente en detalle ni escribes código — despachas."* Editar
producción en el hilo principal tiene dos costos: (1) ese código nunca pasó
por un `test-agent` en modo VEREDICTO con contexto fresco — se saltó la
verificación independiente que es la razón de ser del ciclo ADW — y (2) cada
línea leída/editada de producción vive en el contexto caro y difícil de
compactar del orquestador en vez de en un subagente desechable.

No encontré evidencia de greps masivos repetidos ni de reintentos ciegos de
comandos fallidos por parte del orquestador — los 271 `Bash` del hilo
principal son mayoritariamente `git status`/`git log`/`git diff`/lectura de
gates, consistentes con supervisión normal del ciclo, no con desperdicio.

---

## Recomendaciones priorizadas

1. **Eliminar el falso positivo del hook `git reset --hard`/`rm -rf`
   (impacto alto, esfuerzo bajo).** El campo `"if"` en `settings.json`
   (líneas 67-79) usa el matcher difuso interno de Claude Code, que
   sobre-dispara con `for`, heredocs y tuberías benignas — confirmado 13/13
   en los casos rastreados de la sesión, y reproducido 5 veces en vivo en
   esta misma investigación. Quitar el campo `"if"` y mover la detección a
   **texto literal dentro del propio script del hook** (como ya hace
   correctamente `adw-protect-gates.sh` con sus `grep -qE` sobre
   `adw/gates`), p.ej. `case "$cmd" in *"git reset --hard"*|*"rm -rf "*)
   ... ;; esac` ejecutado siempre (sin condicionar el disparo del hook al
   `if`). Esto no relaja la seguridad — cero comandos genuinamente
   destructivos fueron bloqueados en toda la sesión — y elimina turnos
   perdidos por reintento.

2. **Cortar los round-trips de truncamiento (impacto medio, esfuerzo bajo).**
   65% de los `SendMessage` de continuación (17/26) existen solo para
   reobtener un reporte cortado a mitad de oración; un veredicto necesitó 4
   rondas. Añadir a `test-agent.md`/`builder.md` una instrucción explícita de
   longitud máxima para el mensaje final (mover evidencia extensa a
   `adw/bitacora.md`, que ya se escribe en disco, y dejar el mensaje de
   chat como resumen corto tipo caveman) evita generar el problema en vez de
   parchearlo después.

3. **Revisar si el ciclo de 3 saltos debe aplicar a TODA fase (impacto alto,
   pero es decisión de diseño, no bug).** 6.2 horas medidas de despacho de
   subagente son la palanca más grande del sistema — más que cualquier otro
   factor combinado. No es un error: es rigor deliberado. Pero el ingeniero
   podría evaluar un modo abreviado para fases de bajo riesgo (p.ej. cambios
   de una línea, fixes ya acotados por un loop-back) donde el `test-agent`
   escriba el gate y el veredicto se combine en un solo despacho en vez de
   dos, reduciendo ~33% los despachos en esos casos sin tocar el rigor de las
   fases que sí lo necesitan.

4. **Cerrar el presupuesto de 150 líneas en el momento de escribir el gate,
   no después (impacto bajo, esfuerzo bajo).** 4 despachos se gastaron en
   pedir el recorte a posteriori, y 2 de los 14 gates de M2 siguen sobre el
   presupuesto. Añadir un autochequeo (`wc -l adw/gates/fase-N.sh`) como
   último paso del modo GATE en `test-agent.md`, antes de que el agente
   termine su turno.

5. **No editar producción desde el hilo principal (impacto medio, esfuerzo
   bajo — es disciplina, no código).** Los edits directos a `report.py`,
   `claim_verifier.py`, `prompts.py` y `test_claim_verifier.py` se saltaron
   la verificación de contexto fresco del `test-agent` y violan la regla
   propia de `context-discipline.md`. Si el orquestador necesita un fix
   puntual, debe despacharlo como builder (aunque sea una fase mínima) o, si
   la excepción es deliberada, declararla explícitamente en `estado.md` con
   la razón — nunca editar en silencio.

6. **No invertir tiempo en optimizar la inferencia de Ollama ni en recortar
   `rules/*.md` o `agents/*.md`.** Medido: ~2.4 s por llamada real a
   `llama3.1:8b`, gates `test` en 5.55 s promedio / 27.5 s máximo — no es el
   cuello de botella. Los 7 `agents/*.md` (3863 palabras totales, 552
   palabras/agente en promedio) y las 6 `rules/*.md` (2323 palabras totales)
   son livianos frente a una ventana de contexto de 200k tokens; no hay
   evidencia de que contribuyan de forma desproporcionada al overhead.
