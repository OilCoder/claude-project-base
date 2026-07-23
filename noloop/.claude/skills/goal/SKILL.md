---
name: goal
description: Módulo de investigación ADW - convierte una idea difusa en adw/goal.md investigado y verificado (Researcher ⇄ Verifier → review del ingeniero). Se corre una vez por objetivo; luego /adw consume el goal. Use when the user brings a fuzzy idea or problem to research before building ("/goal <idea>", "investiga esto", "quiero lograr X pero no sé cómo").
---

# Módulo de investigación — protocolo del orquestador

Tú (la sesión principal) orquestas. El humano trae la idea difusa al inicio y
revisa el goal al final. Este módulo corre **una vez por objetivo** — el goal
es el ancla estable; los ciclos de `/adw` que vengan después pueden ser muchos.

## Rails del orquestador

- No investigues tú ni edites el goal: despachas y lees productos.
- Los agentes no se hablan entre sí — tú enrutas veredictos y feedback.
- Reporta al usuario en qué punto del ciclo estás cada vez que despachas.

## El ciclo

### 1. Investigación (Researcher)

Despacha al agente **researcher** con la idea del ingeniero tal cual —
sin traducirla ni acotarla tú: acotar con fundamento es su trabajo.

### 1b. Opinión múltiple (si el researcher la pidió)

Si la salida del researcher trae `DECISIONES PARA /opinion:`, corre el patrón
fusion de `skills/opinion/SKILL.md` por cada decisión (N opinadores paralelos +
fusionador) y redespacha al researcher con las fusiones para que las incorpore
a los Hallazgos. Luego sigue a la verificación.

### 2. Verificación (Verifier, el candado del módulo)

Al volver el researcher, despacha al agente **verifier**.

- **PASS** → sigue al review.
- **FAIL** → redespacha al researcher con el veredicto completo (loop-back).
  Máximo **2 loop-backs**; al tercer FAIL, para y muéstrale al usuario las
  afirmaciones que no se pudieron fundamentar — que él decida si se degradan
  a "por confirmar" o se investiga distinto.

### 3. Engineer Review

Presenta al usuario: el objetivo en una línea, las **métricas de éxito**
(indicador + meta + cómo se mide — son requisito del goal, no adorno),
pilares/rails/non-goals, el done-when, los hallazgos clave y — sobre todo —
las **Incógnitas**.

- Sus respuestas y ajustes → redespacha al researcher para actualizar el goal
  (y de vuelta por el verifier si cambió algún hallazgo).
- Aprobado → el goal queda sellado. Dile que `/adw` ya lo consumirá.

## Encadenamiento con la generación

```
tú (idea difusa) ──► /goal ──► adw/goal.md (estable) ──► /adw ──► código
                                    ▲                      │
                                    └── solo cambia si TÚ ──┘
                                        cambias el objetivo
```

Si durante `/adw` el planner o la bitácora revelan que el goal mismo estaba
mal delimitado (no el plan — el objetivo), eso NO es replaneo: es volver aquí.

## Los productos

| Documento | Naturaleza | Lo escribe |
|---|---|---|
| `adw/goal.md` | Estable — ancla del run; solo cambia por decisión del ingeniero | researcher |
| veredicto | Efímero — viaja en la conversación, no toca disco | verifier |
