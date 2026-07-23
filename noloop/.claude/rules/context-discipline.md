<!-- description: Context discipline for the orchestrator — state file, 50% threshold, directed compaction, post-compact ritual. No paths frontmatter ON PURPOSE: this rule must survive every compaction. -->

# Context Discipline (orquestador)

Aplica a la sesión principal (orquestador macro del sistema ADW). Esta regla
no tiene `paths:` a propósito: se re-inyecta desde disco tras CADA
compactación — es el ancla de memoria del orquestador.

## El archivo de estado: `adw/estado.md`

La memoria de trabajo del orquestador vive en disco, no en el transcript.
Secciones fijas, **máximo ~60 líneas** (al crecer más: reescribir, no anexar):

```markdown
# Estado — <proyecto/objetivo en una línea>
## Goal        → ref a adw/goal.md + el done-when en una línea
## Dónde estamos   → módulo activo, fase actual, loop-backs consumidos
## Decisiones clave → elección + razón (incluye las descartadas importantes)
## Lo intentado que falló → enfoque → por qué murió (LA sección más valiosa:
                     redescubrir callejones sin salida es el desperdicio más caro)
## Próximo paso    → el siguiente despacho concreto
## Arranque rápido → comandos exactos para retomar (tests, gates, rutas)
```

**Cuándo lo actualiza el orquestador**: tras cada conciliación, al cerrar cada
fase, cuando muere un plan, y siempre que llegue el aviso `[context-watch]`.
Escribirlo es parte de orquestar, no trabajo de agentes.

## Umbral del 50% — el aviso `[context-watch]`

Un hook estima el uso de contexto y avisa cuando cruza el umbral. Al recibir
`[context-watch]` en el prompt:

1. Cierra el micro-paso en curso (no dejes un despacho a medias).
2. Actualiza `adw/estado.md`.
3. Propón al usuario el compact dirigido, con el foco ya redactado:
   `/compact conserva: goal, estrategia conciliada, fase actual y sus
   loop-backs, decisiones y fallos de adw/estado.md`.

No esperes el auto-compact (~95% del límite, no dirigible): compactar temprano
y en frontera natural (fase cerrada, goal sellado, pre-implementación) siempre
gana. Si el contexto se rellena enseguida tras compactar (thrashing), el
problema es el patrón de trabajo — delega más, no compactes más.

**Sesión autónoma (el usuario no está para teclear /compact)**: el orquestador
no puede dispararlo — no te bloquees esperándolo. El protocolo cambia a
externalización total: al aviso `[context-watch]`, vuelca a `adw/estado.md`
TODO lo que no está en disco (decisiones, fallos, próximo paso con detalle
extra: te vas a re-leer sin memoria de esta conversación) y sigue trabajando.
El auto-compact llegará solo; el snapshot de PreCompact y el ritual
post-compact te recuperan. Un estado.md impecable convierte el auto-compact de
amenaza en molestia.

## Ritual post-compact

Lo primero tras cualquier compactación (el resumen de compactación es la
señal), ANTES de cualquier otra acción:

1. Lee `adw/estado.md` — el estado exacto, no el recuerdo aproximado.
2. Lee `adw/goal.md` (si existe) y la fase activa de `adw/plan.md`.
3. Retoma desde "Próximo paso".

## Briefings magros (la trampa del fan-out)

El resumen de cada subagente vuelve a tu contexto — un fan-out de reportes
verbosos consume lo que intentas proteger:

- Todo despacho pide **conclusión, no transcript** ("reporta solo los tests
  que fallan", "hallazgos que cambian decisiones, no todo lo leído").
- El trabajo de alto volumen (crawls, sweeps, logs) vive y muere en el
  subagente.
- Tú nunca lees archivos fuente en detalle ni escribes código — despachas.
