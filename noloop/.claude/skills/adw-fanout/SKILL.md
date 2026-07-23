---
name: adw-fanout
description: Ciclo ADW en fan-out paralelo (diagrama 6) - N worktrees, cada uno con su ciclo Planner → Builder ⇄ Tester → Review, luego Merge → Ship. Use when the user wants parallel worktrees for a task ("/adw-fanout <N> <tarea>", "fan-out", "worktrees en paralelo", "que compitan varios enfoques").
---

# Fan-out ADW — protocolo del orquestador (diagrama 6)

La unidad que se replica es el ciclo completo de `skills/adw/SKILL.md` — este
protocolo solo añade el despacho a N worktrees, el merge y la limpieza. Los
rails del orquestador son los mismos: nunca editas código, lees solo productos.

## 0. Entrada y modo

- Tarea + N worktrees (default: 3, como el diagrama).
- **Modo** — pregúntale al usuario si no lo dijo, cambia todo el diseño:
  - **dividir**: cada worktree ataca una parte independiente de la tarea;
    el merge las integra todas.
  - **competir**: todos atacan la tarea completa con enfoques distintos;
    el merge elige un ganador y descarta el resto.
- Advierte el costo antes de arrancar: N ciclos completos = N planners +
  N×(builders + testers) en paralelo.

## 1. Setup de worktrees

```bash
# Asegura que la carpeta está ignorada (local, sin ensuciar el repo):
grep -qx '.claude/worktrees/' .git/info/exclude 2>/dev/null || echo '.claude/worktrees/' >> .git/info/exclude
# Un worktree por rama, desde la rama actual:
git worktree add .claude/worktrees/adw-w1 -b adw/w1
git worktree add .claude/worktrees/adw-w2 -b adw/w2
...
```

Requisito: `.claude/` (hooks y agentes) debe estar trackeado en el repo para
que cada worktree lo contenga. Si no lo está, detente y díselo al usuario.

## 2. Planeación paralela

Despacha los N planners **en un solo mensaje** (paralelo), cada uno con su
worktree asignado y su variante del prompt:

- dividir → "tu parte es <sub-tarea i>"
- competir → "tu enfoque es <ángulo i>" (elige N ángulos genuinamente
  distintos: p.ej. mínimo-cambio, rediseño-limpio, orientado-a-datos)

En fan-out **no hay review humano de los planes** (ese es el trade-off de la
paralelización — el diagrama 6 pone tu review al final de cada worktree, no
tras el planner). Verifica tú que cada plan respete su sub-tarea/ángulo antes
de ejecutar; si un plan invade el terreno de otro worktree, redespacha ese
planner.

## 3. Ejecución por worktree

Para cada worktree, el ciclo interno idéntico al de `/adw`: Builder(fase) →
Tester(fase) → PASS avanza / FAIL loop-back (máx. 3) / ESCALATE para ese
worktree (no frena a los demás). Los despachos de worktrees distintos pueden
ir en paralelo; dentro de un worktree son secuenciales.

Un worktree que escala o agota loop-backs se marca **caído** y se reporta;
el fan-out sigue con los vivos.

## 4. Engineer Review por worktree

Cuando un worktree completa todas sus fases: preséntale al usuario su
`git diff --stat`, su bitácora y el estado de gates. El usuario marca
pass/fail por worktree. Fail con feedback → replaneo de ESE worktree
(planner con el feedback, como en `/adw`).

Con cada worktree que pasa: commit en su rama (`git -C <worktree> add -A && commit`)
— el merge necesita commits.

## 5. Merge

- **dividir**: merge secuencial de cada rama aprobada sobre la rama base.
  Conflicto trivial (imports, líneas vecinas) → resuélvelo y sigue; conflicto
  real (dos worktrees tocaron la misma lógica) → despacha un builder con el
  conflicto como fase única, o escala al usuario.
- **competir**: recomienda un ganador con evidencia (gates en verde, diff más
  simple, bitácora con menos loop-backs) — **el usuario elige**. Merge solo de
  la rama ganadora.

**Gate post-merge obligatorio**: corre la cadena completa
(`bash .claude/hooks/adw-stop-gate.sh` a mano o gate por gate) sobre el
resultado integrado. Un merge que deja el repo en rojo no es un merge
terminado — de todos modos tu Stop gate no te dejará cerrar el turno.

## 6. Limpieza (solo con confirmación del usuario)

1. **Preserva la evidencia primero**: copia la `adw/bitacora.md` de cada
   worktree (incluidos caídos y perdedores) al `adw/bitacora.md` principal,
   cada una bajo un encabezado `# Worktree wN — <modo/ángulo>`.
2. Luego, con el ok del usuario: `git worktree remove` de cada uno y
   `git branch -D` de las ramas no mergeadas. Nunca fuerces la eliminación de
   un worktree con cambios sin commitear sin mostrárselo antes.

## Resumen del flujo

```
tú ──tarea──► setup N worktrees ──► N × [Planner → Builder ⇄ Tester] (paralelo)
                                          │
                              tú: review por worktree
                                          │
                            MERGE (integrar o elegir ganador)
                                          │
                        gate post-merge → limpieza → ship
```
