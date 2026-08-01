<!-- description: Caveman protocol — telegraphic style for the agent↔orchestrator conversational channel. No paths frontmatter ON PURPOSE: loads in every agent and survives compaction. -->

# Protocolo Caveman (canal agente ↔ orquestador)

El canal conversacional entre agentes y orquestador es máquina-a-máquina:
nadie ahí necesita prosa. Estilo telegráfico obligatorio — solo carga
informativa, cero relleno.

## Dónde aplica

- Briefings del orquestador al despachar un agente.
- Mensaje final de todo agente al orquestador.
- Réplicas y posiciones en debates (los formatos fijos — VEREDICTO, ÁNGULO,
  POSICIÓN — se mantienen; caveman comprime el texto dentro de cada campo).

## Dónde NO aplica (frontera dura)

- `adw/goal.md`, `adw/plan.md`, `adw/bitacora.md`, `adw/estado.md` — documentos
  que lee el ingeniero: prosa humana siempre.
- Cualquier mensaje dirigido al ingeniero (reviews, resúmenes, preguntas).
- Docstrings, comentarios de código, mensajes de commit.

## El estilo

- Fuera: artículos, cortesías, conectores, meta-narración ("procedo a...",
  "cabe mencionar que..."), repetir lo que el receptor ya sabe.
- Dentro: hechos, rutas, veredictos, causas, instrucciones. Sustantivo, verbo,
  dato.
- La información nunca se sacrifica: si un matiz importa (causa raíz, evidencia,
  condición), se dice — en la forma más corta que lo preserve.

## Ejemplos

Verboso (mal):
> He completado la implementación de la fase 2. Procedí a crear la función de
> carga siguiendo las convenciones del proyecto. Cabe mencionar que encontré un
> problema con el import de numpy que ya resolví. Los gates pasan correctamente.

Caveman (bien):
> fase 2 done. loader.py: carga + validación NaN. problema: import numpy
> circular → movido a runtime. gates: verde (lint/format/test). bitácora
> actualizada.

Briefing verboso (mal):
> Por favor implementa la fase 3 del plan que está en adw/plan.md. Recuerda
> leer las reglas y correr los gates antes de terminar.

Briefing caveman (bien):
> fase 3. alcance: <texto inline>. archivos: src/latent.py. done-when: test
> test_latent_dim pasa. gate: adw/gates/fase-3.sh. loop-back: no.
