---
name: opinion
description: Patrón fusion para decisiones - N opinadores Opus independientes en paralelo (ángulos distintos, sin verse) + un fusionador que contrasta en consenso/divergencias/descartado. Use when the user faces a technical or design decision and wants multiple perspectives ("/opinion <pregunta>", "dame perspectivas", "¿X o Y?", "no sé qué elegir").
---

# Patrón fusion — protocolo del orquestador

Un nodo de decisión: en vez de una respuesta de un agente, N perspectivas
independientes contrastadas. Se usa para decisiones, no para rutina — cada
invocación cuesta N+1 despliegues de Opus.

## Rails del orquestador

- No opines tú antes de la fusión: tu papel es enrutar y presentar.
- Los opinadores no se ven entre sí — despáchalos en un solo mensaje
  (paralelo) y nunca le pases a uno la salida de otro.

## El ciclo

### 1. Ángulos

Define N ángulos genuinamente distintos para la pregunta (default N=2,
máximo 3). Los ángulos salen de la naturaleza de la decisión, p.ej.:

- técnica: "mínimo-cambio pragmático" vs "robustez a largo plazo"
- de stack: "usa lo que el repo ya tiene" vs "la herramienta idónea aunque sea nueva"
- de dominio: "rigor del dominio (geo/petro/ML)" vs "simplicidad operativa"

El punto no es cubrir todo, es que las perspectivas puedan **discrepar de
verdad** — ángulos que siempre coinciden no aportan contraste.

### 2. Opiniones (paralelo)

Despacha N agentes **opinion** en un solo mensaje, cada uno con la pregunta
y su ángulo.

### 2b. Réplicas (opcional, si hay divergencia que lo amerite)

Si las posiciones divergen en algo decisivo, corre rondas de réplica cruzada
(modo réplica del opinador: a cada uno le pasas la posición del otro).
**Máximo 3 rondas en total** (apertura + hasta 2 de réplica); corta antes si
convergen o si la divergencia ya quedó bien caracterizada.

### 3. Conciliación

**El conciliador eres tú** — el orquestador, con el contexto completo del
proyecto que los opinadores no tienen. Contrasta: consenso, divergencias
(¿por ángulo o por hecho? los hechos se verifican, no se votan), descartado,
y tu recomendación con la razón.

El agente **fusion** queda como descarga opcional: úsalo solo si las salidas
son tan largas o tantas que conciliarlas directamente ensuciaría tu contexto
macro — y aun así, la decisión final sobre su fusión es tuya.

### 4. Presentación

Presenta al usuario la conciliación (consenso / divergencias / descartado /
recomendación tuya). La decisión final es del usuario — la conciliación
informa, no decide.

Si el usuario quiere el resultado en disco, guárdalo donde él diga
(p.ej. `adw/decisiones/<slug>.md`).

## Uso dentro del módulo de investigación

El researcher no puede despachar agentes (los subagentes no anidan). El flujo
es vía orquestador, definido en `skills/goal/SKILL.md`: el researcher marca en
su salida las decisiones que ameritan opinión múltiple, tú corres este patrón
por cada una, y le devuelves las fusiones al researcher para que las incorpore
a los Hallazgos del goal (con la fusión citada como fuente del contraste).
