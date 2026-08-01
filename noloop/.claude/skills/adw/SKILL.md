---
name: adw
description: Orquesta el ciclo ADW completo (diagramas 4-5) - Planner → [por fase - Builder ⇄ Test Agent] → Engineer Review. Use when the user gives a development task to run through the ADW cycle ("/adw <tarea>", "corre el ciclo con esto", "ADW esto").
---

# Ciclo ADW — protocolo del orquestador

Tú (la sesión principal) eres el **orquestador** del diagrama 5. Tu trabajo es
despachar agentes y leer sus productos. El humano es Engineer Prompt al inicio y
Engineer Review en dos puntos: el plan y el resultado final.

## Rails del orquestador

- **Nunca edites código ni leas archivos fuente en detalle.** Tu contexto se
  mantiene limpio a propósito: toda la información te llega por los productos
  (`adw/plan.md`, veredictos del Test Agent, `adw/bitacora.md`). Tu valor está
  en la orquestación macro y en conciliar con información completa — las
  decisiones de conciliación son tuyas, no de un agente.
- Los agentes no se hablan entre sí — se comunican por el filesystem y tú enrutas.
- Reporta al usuario en qué punto del ciclo estás cada vez que despachas.

## El ciclo

### 1. Planeación (debate de estrategia → conciliación tuya → Planner)

La capa que se debate no es el plan (desechable) sino la **estrategia de
troceo** — se paga una vez por ciclo:

1. **Debate**: despacha 2 agentes **opinion** (Opus) en paralelo con la tarea
   + el goal, cada uno proponiendo una estrategia de troceo desde su ángulo.
   Luego una ronda de réplica cruzada (modo réplica: a cada uno le pasas la
   posición del otro). **Máximo 3 rondas en total** (apertura + hasta 2 de
   réplica); corta antes si las posiciones convergen.
2. **Conciliación (tuya)**: con las posiciones finales y tu contexto completo
   del proyecto, decide la estrategia — puede ser una, la síntesis, o una
   tercera si el debate reveló que ambas fallan. Deja escrita la razón.
3. Despacha al agente **planner** con el prompt del ingeniero + tu estrategia
   conciliada. Él la convierte en fases.
4. Al volver, presenta al usuario el resumen del plan (estrategia elegida y
   por qué, fases con sus done-when, riesgos) y espera su review.
5. Si pide ajustes → redespacha al planner con el feedback. Si aprueba →
   **abre la rama del ciclo** (`git checkout -b adw/<slug-corto>` desde la rama
   actual — anota cuál era, es el destino del merge) y ejecuta.

**Replaneos** (fase inviable, ESCALATE, review fallido): el planner regenera
el plan **reutilizando tu estrategia conciliada** — sin debate nuevo. Solo
re-debate si el fallo invalida la estrategia misma (no el troceo), y el
feedback del usuario lo sugiere.

### 2. Ejecución por fase (validación-primero: Gate → Builder ⇄ Veredicto)

**Briefings autocontenidos y en caveman** (ver `rules/caveman-protocol.md`):
cada despacho incluye INLINE el texto de la fase (alcance, archivos, done-when)
y la ruta del gate — el agente arranca frío; no lo pongas a re-localizar lo que
tú ya tienes enfrente.

Para cada fase del plan, en orden:

1. **Gate primero**: despacha al **test-agent** en modo GATE con el briefing de
   la fase — escribe `adw/gates/fase-N.sh` (el contrato de terminado) antes de
   que exista el código, y confirma que falla en vacío.
2. Despacha al agente **builder** con el briefing de la fase (+ veredicto si es
   loop-back). Construye contra el gate (puede ejecutarlo, no editarlo — un
   hook lo bloquea).
3. Al volver, despacha al **test-agent** en modo VEREDICTO con el briefing de
   la misma fase.
4. Según el veredicto:
   - **PASS** → commit de la fase en la rama del ciclo
     (`feat(fase-N): <título>` — la rama acumula un commit verificado por
     fase, trazabilidad del ciclo) y siguiente fase.
   - **FAIL** → redespacha al builder con el veredicto completo (loop-back).
     Máximo **3 loop-backs por fase**; al cuarto FAIL, para y escala al usuario.
   - **ESCALATE** → para el ciclo y preséntale al usuario el motivo. Casi
     siempre termina en replaneo (paso 3) o en una decisión suya.

### 3. Cierre (Engineer Review → Ship)

1. Con todas las fases en PASS, presenta al usuario: el objetivo cumplido, el
   `git diff --stat`, y las entradas nuevas de `adw/bitacora.md`. Si
   `adw/goal.md` define métricas de éxito medibles por comando, córrelas y
   presenta el valor obtenido junto a la meta — el review decide con números,
   no con impresiones.
2. **Review falla con feedback** → despacha al planner con el feedback. El
   plan anterior está muerto pero el ciclo sigue: el nuevo plan trabaja sobre
   la **misma rama del ciclo** (el plan cambia a toda hora — es desechable;
   el goal del ingeniero es lo estable).
3. **El usuario descarta el intento entero** → ese es el valor de la rama:
   vuelve a la rama base con la base intacta. **Nunca borres la rama** — los
   intentos fallidos son evidencia: renómbrala a `adw/descartado/<slug>`
   (la lista de ramas queda auto-documentada) y registra en la bitácora por
   qué se descartó — insumo directo para "Lo intentado que falló".
4. **Review pasa** → ship: merge de la rama del ciclo a la rama base
   (`git merge --no-ff adw/<slug>`). La rama mergeada queda viva (podarla es
   decisión manual del ingeniero, nunca del orquestador). La base solo recibe
   ciclos completos aprobados, en commits de fase verificados.

## Variante fan-out

Para correr N ciclos como este en worktrees paralelos y luego mergear
(diagrama 6), usa `skills/adw-fanout/SKILL.md` — este ciclo es la unidad que
ahí se replica.

## Los tres productos

| Documento | Naturaleza | Lo escribe |
|---|---|---|
| `adw/plan.md` | Desechable — se regenera entero en cada replaneo | planner |
| código | Verificado — gates + veredicto del test-agent | builder |
| `adw/bitacora.md` | Acumulativa — append por despliegue; alimenta el replaneo | builder |
