---
name: goal
description: Módulo de investigación ADW - convierte una idea difusa en adw/goal.md investigado y verificado (Researcher ⇄ Verifier → review del ingeniero). Se corre una vez por objetivo; luego /adw consume el goal. Use when the user brings a fuzzy idea or problem to research before building ("/goal <idea>", "investiga esto", "quiero lograr X pero no sé cómo").
---

# Módulo de investigación — protocolo del orquestador

Tú (la sesión principal) orquestas **y concilias**: eres el único nodo con
contexto completo del proyecto, así que las decisiones de conciliación son
tuyas — no de un agente. El humano trae la idea difusa al inicio y revisa el
goal al final. Este módulo corre **una vez por objetivo** — el goal es el
ancla estable; los ciclos de `/adw` que vengan después pueden ser muchos.

## Rails del orquestador

- **Nunca escribes código ni redactas los documentos tú** — tu contexto sirve
  para la orquestación macro y para conciliar con información completa; el
  trabajo de campo y la redacción son de los agentes.
- Los agentes no se hablan entre sí — tú enrutas, contrastas y decides.
- Reporta al usuario en qué punto del ciclo estás cada vez que despachas.

## El ciclo

### 1. Investigación en pareja (dinámica de conciliación)

Despacha **dos researchers en paralelo** (un solo mensaje) con la idea del
ingeniero tal cual y un ángulo distinto cada uno — ángulos que puedan
discrepar de verdad (p.ej. "aprovecha lo que el repo ya tiene" vs "la
solución idónea del dominio aunque sea nueva"). Cada uno devuelve su informe
de hallazgos, sin escribir goal.md.

### 2. Conciliación (tuya)

Contrasta los dos informes con tu conocimiento del proyecto:

- **Consenso** → entra directo al goal.
- **Divergencia por hecho** → despacha una verificación puntual o resuélvela
  con evidencia del repo; no se vota.
- **Divergencia por ángulo** → decide TÚ, con la información completa que los
  agentes no tienen, y deja escrita la razón.

Si los informes dejan huecos que impiden conciliar, redespacha con preguntas
puntuales. **Máximo 3 rondas de investigación en total** — al llegar al tope,
lo no resuelto se convierte en Incógnitas para el ingeniero.

Con la conciliación cerrada, despacha a **un** researcher en modo redacción:
tu conciliación como entrada → él escribe `adw/goal.md`.

Si algún informe trae `DECISIONES PARA /opinion:` (decisión estructural),
resuélvela dentro de tu conciliación; si tu información no alcanza, corre
rondas de opinadores (`skills/opinion/SKILL.md`, Opus, máximo 3 rondas) y
decide tú con el contraste.

### 3. Verificación (Verifier, el candado del módulo)

Con `adw/goal.md` redactado, despacha al agente **verifier**.

- **PASS** → sigue al review.
- **FAIL** → redespacha al researcher redactor con el veredicto completo
  (loop-back). Máximo **2 loop-backs**; al tercer FAIL, para y muéstrale al
  usuario las afirmaciones que no se pudieron fundamentar — que él decida si
  se degradan a "por confirmar" o se investiga distinto.

### 4. Engineer Review

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
