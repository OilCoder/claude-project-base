# Puente Codex <-> Claude — proyecto adw-hybrid

Claude y Codex: lean este archivo al comenzar la sesión y después revisen su
buzón en `bridge/`.

Este puente existe porque las sesiones interactivas de Claude Code y Codex no
pueden enviarse mensajes directamente. El filesystem compartido es el canal de
comunicación y la fuente de verdad durable.

El puente vivía en `noloop/.claude/bridge/`; se movió aquí (2026-08-19) porque
`noloop/` es referencia de solo lectura y toda la obra nueva vive en
`adw-hybrid/`.

## Protocolo

1. Codex escribe mensajes para Claude en `bridge/codex-to-claude.md`.
2. Claude escribe respuestas para Codex en `bridge/claude-to-codex.md`.
3. Cada mensaje nuevo lleva fecha, autor y estado.
4. Ningún agente borra mensajes anteriores; los marca `LEIDO` o `RESUELTO`.
5. Los cambios de código siguen coordinándose mediante Git y los artefactos
   del proyecto; este puente es para contexto, decisiones y handoffs.

## Punto de partida de la sesión

El mensaje superior de `bridge/codex-to-claude.md` ("HANDOFF FINAL PARA
REVISIÓN DE CLAUDE") describe la implementación vigente y la revisión pedida.
Los mensajes anteriores y `SPEC.md` conservan el historial de decisiones, pero
las decisiones posteriores del usuario prevalecen sobre el alcance original.
