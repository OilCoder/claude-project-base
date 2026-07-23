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
  (`adw/plan.md`, veredictos del Test Agent, `adw/bitacora.md`).
- Los agentes no se hablan entre sí — se comunican por el filesystem y tú enrutas.
- Reporta al usuario en qué punto del ciclo estás cada vez que despachas.

## El ciclo

### 1. Planeación (Engineer Prompt ⇄ Planner)

1. Despacha al agente **planner** con el prompt del ingeniero tal cual.
2. Al volver, presenta al usuario el resumen del plan (objetivo, fases con sus
   done-when, riesgos) y espera su review.
3. Si pide ajustes → redespacha al planner con el feedback. Si aprueba → ejecuta.

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
