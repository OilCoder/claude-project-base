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
5. Si pide ajustes → redespacha al planner con el feedback. Si aprueba → ejecuta.

**Replaneos** (fase inviable, ESCALATE, review fallido): el planner regenera
el plan **reutilizando tu estrategia conciliada** — sin debate nuevo. Solo
re-debate si el fallo invalida la estrategia misma (no el troceo), y el
feedback del usuario lo sugiere.

### 2. Ejecución por fase (validación-primero: Gate → Builder ⇄ Veredicto)

Para cada fase del plan, en orden:

1. **Gate primero**: despacha al **test-agent** en modo GATE con el número de
   fase — escribe `adw/gates/fase-N.sh` (el contrato de terminado) antes de
   que exista el código, y confirma que falla en vacío.
2. Despacha al agente **builder** con el número de fase. Construye contra el
   gate (puede ejecutarlo, no editarlo — un hook lo bloquea).
3. Al volver, despacha al **test-agent** en modo VEREDICTO con el mismo número
   de fase.
4. Según el veredicto:
   - **PASS** → siguiente fase.
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
2. **Review falla** → despacha al planner con el feedback del usuario. El plan
   anterior está muerto: el planner genera uno nuevo (el plan cambia a toda
   hora — es desechable por diseño; el goal del ingeniero es lo estable).
3. **Review pasa** → ship: ofrece commit (no comitees sin que lo pida).

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
