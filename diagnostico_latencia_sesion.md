# Diagnóstico de latencia — sesión 4ae2416b (27-jul → 4-ago-2026)

Informe para mejorar el sistema ADW en una sesión aparte. Dos fuentes:
auditoría del estado actual de `.claude/` y análisis forense del transcript
completo de la sesión (22.1 MB, 5113 eventos).

## Resumen ejecutivo

La sesión duró 190.8 h de reloj, de las cuales **18.4 h fueron tiempo activo**
(el resto: 78 gaps de usuario ausente que suman 172.4 h). De esas 18.4 h
activas, **el 58% (10.6 h) fue el orquestador parado esperando agentes en
background**. Ese es EL problema. Todo lo demás — Stop-gate, pytest, ruff,
overhead de wsl.exe — es ruido de minutos.

La causa no es una pieza rota sino la **arquitectura secuencial del ciclo**:
GATE → builder → VEREDICTO estrictamente en serie (3 agentes por fase, media
17.2 min por agente, 24.4 h de wall agregado entre 87 dispatches), sin solapar
nada entre fases. Dos agravantes ya mitigados durante la propia sesión: agentes
internamente lentos por verificaciones pesadas (atacado por la directiva de
presupuesto de verificación del 2-ago) y la epidemia de cortes por maxTurns
(atacada subiendo límites en b677e21).

## Panorama de la sesión

| Métrica | Valor |
|---|---|
| Duración de reloj | 190.8 h (~8 días) |
| Tiempo activo real | 18.4 h |
| Prompts humanos | 47 |
| Tool calls emparejados | 621 |
| Dispatches de agentes | 87 (81 completed, 3 failed, 1 killed) |
| Reanudaciones vía SendMessage | 50 (25 por cortes de maxTurns) |
| Compactaciones | 3 (1-ago, 3-ago, 4-ago por contexto agotado) |
| Corridas del Stop-gate | 220 (media 3.5 s, total 12.9 min, 9 bloqueos) |

Desglose de las 18.4 h activas:

1. **Espera a agentes background: 10.6 h (58%)**
2. Generación LLM del orquestador: 4.0 h (21%) — normal, es el trabajo
3. Overhead harness/system: 1.6 h (8.5%)
4. Espera humana (leer/teclear): 1.2 h
5. Ejecución de tools: 53 min — y de eso, los scripts `wait_*` bloqueantes
   son 51.5 min (82% de todo Bash)

## Causas raíz, por impacto

### 1. Serialización estricta del ciclo (10.6 h, 58% del tiempo activo)

Cada fase paga 3 agentes en serie y el orquestador no solapa nada: no lanza el
GATE de la fase N+1 mientras corre el VEREDICTO de la fase N, ni agrupa fases
pequeñas. En el ciclo F10-F15 cada fase costó 45-90 min de reloj siendo casi
todo espera secuencial.

**Palancas**: (a) solapar GATE de N+1 con VEREDICTO de N — el GATE no depende
del veredicto anterior, solo del plan; (b) fases más pequeñas → agentes más
cortos; (c) para fases triviales (docs, renames), considerar un modo ligero
sin los 3 agentes completos.

### 2. Agentes internamente lentos (24.4 h de wall agregado) — YA MITIGADO

Los VEREDICTOs y GATEs de 20-76 min (VEREDICTO F12: 76 min; F15: 73 min;
Builder F16: 126 min y murió) pagaban suites y cronometrajes pesados sobre el
dump. La directiva de presupuesto de verificación (CLAUDE.md, 2-ago) ataca
exactamente esto: en el ciclo F22-F29 los agentes bajaron a 2-20 min.
**Mantener la directiva; no hay acción nueva.**

### 3. Cortes por maxTurns (~2 h + fricción) — YA MITIGADO

25 reanudaciones por corte; el 3-ago hubo una cada ~10 min durante horas. Cada
corte cuesta ~5-8 min (re-briefing + re-lectura de contexto del agente).
Mitigado en b677e21 (test-agent 15→40, builder 30→50). **Pendiente**: `opinion`
sigue en maxTurns 10 con herramientas web — corte casi garantizado; subir a 20
o quitarle web cuando el ángulo es solo-repo.

### 4. Muertes por límite de sesión/tokens (≥4 agentes)

Peor caso: Builder F16 corrió 126 min y murió; el trabajo se rescató a mano.
Además 2 stalls nocturnos (8.9 h y 10.7 h) donde todo quedó parado hasta que
el humano volvió. **Palancas**: fases más pequeñas (misma palanca que #1);
para sesiones autónomas largas, un mecanismo de reanudación sin humano
(Monitor/cron) o simplemente aceptar el stall como idle.

### 5. Scripts `wait_*` bloqueantes (51.5 min de Bash foreground)

`wait_f23_suite.sh` se corrió 9 veces en foreground con llamadas de 5-9 min
(las 7 llamadas Bash más lentas de la sesión son todas `wait_*`). Es polling
de suites en un Bash bloqueante. **Palanca**: correr esas esperas con
`run_in_background` y dejar que la notificación despierte al orquestador.

### 6. Screenshots leídos por el orquestador (inflación de contexto)

El 27-jul (día Osa/capturas) el orquestador leyó screenshots con Read: los 15
eventos más grandes del transcript son tool_results de imágenes (hasta 1.2 MB);
una sola hora generó 9 MB de los 22 MB del archivo (41%). Eso precipitó las
compactaciones posteriores. El 3-ago ya se hizo bien (subagentes "Transcribir
gemas tanda A/B/C"). **Regla**: imágenes SIEMPRE vía subagente; el orquestador
recibe solo la transcripción.

## Lo que NO es el problema (descartado con cifras)

- **Stop-gate**: 220 corridas × 3.5 s = 12.9 min totales en 8 días; bloqueó 9
  veces, todas legítimas. Funciona como se diseñó.
- **pytest/ruff directos**: 2.4 min cada uno en total.
- **Overhead de wsl.exe**: ~1-3 s por llamada sobre 152 llamadas.
- **Re-corridas de fases selladas**: cero en este tramo — la directiva se
  respetó tras codificarse.

## Defectos encontrados en `.claude/` (auditoría del estado actual)

1. **Guards `"if"` en PreToolUse(Bash)** (`settings.json:61-80`): el campo
   `"if"` no es un matcher fiable — bloquea comandos inocentes (reproducido en
   vivo durante la auditoría con un `for f in *.jsonl`; la memoria documenta
   misfires con `$VARS`, `-f`, heredocs). El coste real son iteraciones del
   agente reformulando comandos. **Fix**: reemplazar por un script que parsee
   `tool_input.command` con jq (como ya hace `protect-gates`).
2. **`posttool-lint` muerto pero cobrando en Windows**: en sesiones git-bash
   Windows `command -v ruff/uvx` fallan → exit 0 silencioso, pero paga 2
   spawns + jq por CADA Edit/Write (~200-500 ms). Además está **duplicado**:
   registrado en `settings.json:50` global Y en el frontmatter de
   `builder.md:14-18` → doble ejecución para el builder. **Fix**: dejarlo solo
   en builder.md (su único beneficiario) o darle fallback wsl.exe.
3. **Stop-gate corre en turnos sin código**: preguntas y orquestación pura
   pagan la cadena completa (~2.6 s en WSL; ~5-10 s desde Windows por 3 cruces
   `wsl.exe -- bash -lc` con login shell). **Fix**: short-circuit si el turno
   no tocó archivos (git status / mtime antes de lanzar la cadena).
4. **test-agent en opus para VEREDICTO**: el modo VEREDICTO es mecánico
   (correr gate + cadena); candidato a sonnet. El modo GATE puede quedarse
   en opus.
5. **Limpiezas menores**: allow muerto en `settings.local.json:4` (apunta a
   `adw/gates/fase-20.sh`, ya archivado); comentario stale en
   `adw-stop-gate.sh:8-10` (menciona un registro SubagentStop que no existe);
   la skill `/opinion` dice "opinadores Opus" pero `opinion.md` declara
   `model: fable`.
6. Verificado en verde: `adw/gates/` raíz limpia, nada referencia `archivo/`,
   la directiva de presupuesto está estructuralmente respetada.

## Recomendaciones priorizadas

| # | Acción | Impacto estimado | Esfuerzo |
|---|---|---|---|
| 1 | Solapar GATE N+1 con VEREDICTO N (protocolo del orquestador) | Alto — ataca el 58% | Bajo (regla de orquestación) |
| 2 | Fases más pequeñas en el planner (agentes de <15 min) | Alto | Bajo (instrucción al planner) |
| 3 | Esperas largas siempre `run_in_background` | ~50 min/sesión + turnos libres | Trivial |
| 4 | Imágenes solo vía subagente (regla escrita) | Evita compactaciones prematuras | Trivial |
| 5 | Reemplazar guards `"if"` por script jq | Elimina falsos bloqueos | Medio |
| 6 | Deduplicar/arreglar posttool-lint | Micro-latencia por edición | Bajo |
| 7 | Stop-gate short-circuit en turnos sin código | 5-10 s/turno en Windows | Bajo |
| 8 | opinion maxTurns 10→20; VEREDICTO a sonnet | Menos cortes; menor coste | Trivial |
| 9 | Limpiezas menores (allow muerto, comentarios stale) | Higiene | Trivial |

Las dos mitigaciones ya hechas durante la sesión (directiva de presupuesto de
verificación y subida de maxTurns) son las que explican por qué el ciclo
F22-F29 fue mucho más rápido que el F10-F15 — conservarlas tal cual.
