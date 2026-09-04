# Jerarquia de eventos

Este documento representa graficamente el routing, la planificacion paralela,
la ejecucion del Runner y la verificacion del sistema de generacion de codigo.

## Flujo general

```mermaid
flowchart TD
    A[Objetivo del usuario] --> B[Inspeccion ligera]
    B --> C{Router}

    C -->|Trabajo pequeno| D[Contrato directo]
    C -->|Cambio de varias partes| E[Planner]
    C -->|Alta incertidumbre| F[Investigacion y opiniones]

    F --> G[Decision tecnica]
    G --> E

    E --> H[Plan DAG]
    H --> I[Contratos por fases]

    D --> J[Gate Ready]
    I --> J

    J --> K[Orchestrator]
    K --> L[Runner]
    L --> M[Builder]
    M --> N[Verifier]
    N --> O{Gate}

    O -->|PASS| P[Integrar resultado]
    O -->|FAIL corregible| Q[Reintentar con evidencia]
    O -->|Contrato incorrecto| R[Regresar al Planner]
    O -->|Fallo definitivo| S[Detener]

    Q --> L
    R --> E
    P --> T[Completado]
```

## Ruta directa

```mermaid
flowchart LR
    A[Trabajo pequeno detectado] --> B[Router]
    B --> C[Contrato unico]
    C --> D[Runner]
    D --> E[Builder]
    E --> F[Verificacion existente]
    F --> G{Gate}
    G -->|PASS| H[Completado]
    G -->|FAIL| I[Corregir o detener]

    X[Sin Planner pesado]:::skip
    Y[Sin opiniones]:::skip
    Z[Sin investigacion]:::skip
    W[Sin paralelismo]:::skip

    classDef skip fill:#eee,stroke:#999,color:#555
```

El trabajo pequeno puede proceder directamente del usuario o ser descubierto
por el Orchestrator durante una construccion, verificacion o integracion.

## Trabajo derivado durante la ejecucion

```mermaid
flowchart TD
    A[Contrato, Gate o integracion] --> B[Hallazgo detectado]
    B --> C[DERIVED_WORK_DETECTED]
    C --> D{Router clasifica el hallazgo}

    D -->|Dentro del objetivo, pequeno y bajo riesgo| E[Contrato de reparacion directo]
    E --> F[Builder]
    F --> G[Gate acotado]
    G -->|PASS| H[Continuar plan original]
    G -->|FAIL| I[Escalar o detener]

    D -->|Cambia alcance o arquitectura| J[REPLAN_REQUIRED]
    D -->|Necesita decision de producto| K[USER_DECISION_REQUIRED]
    D -->|No es necesario para el objetivo| L[Registrar sin ejecutar]
```

Todo trabajo derivado conserva trazabilidad hacia el contrato y evidencia que
lo originaron. No puede ampliar APIs, dependencias, arquitectura o alcance de
producto sin replanificacion o autorizacion del usuario.

## Plan paralelo

```mermaid
flowchart TD
    A[Planner] --> B[Plan DAG]
    B --> C[Validador]

    C -->|Valido| D[Oleada 1]
    C -->|Invalido| X[Revisar plan]

    D --> A1[Contrato A]
    D --> B1[Contrato B]
    D --> C1[Contrato C]

    A1 --> WA[Worktree A]
    B1 --> WB[Worktree B]
    C1 --> WC[Worktree C]

    WA --> BA[Builder A]
    WB --> BB[Builder B]
    WC --> BC[Builder C]

    BA --> GA{Gate A}
    BB --> GB{Gate B}
    BC --> GC{Gate C}

    GA -->|PASS| J[Oleada completada]
    GB -->|PASS| J
    GC -->|PASS| J

    GA -->|FAIL| K[Oleada bloqueada]
    GB -->|FAIL| K
    GC -->|FAIL| K

    J --> L[Integracion]
    L --> M{Gate final}
    M -->|PASS| N[Completado]
    M -->|FAIL| O[Replanificar o corregir]
```

## Runner Go con Use balance

```mermaid
flowchart TD
    A[Contrato sellado] --> B{Seleccionar modelo capaz}
    B -->|Go cumple requisitos| C[OpenCode Go]
    B -->|Go insuficiente| Z[Modelo exclusivo de Zen]
    Z --> E[Builder termina]
    C --> D{Resultado del proveedor}

    D -->|Ejecucion correcta| E[Builder termina]
    D -->|Limite Go y Use balance| F[Mismo modelo consume saldo Zen]
    F --> E
    D -->|Saldo Zen agotado| U[USER_ACTION_REQUIRED]
    Z -->|Saldo Zen agotado| U
    U --> R[Conservar estado y pedir recarga]

    D -->|Autenticacion| I
    D -->|Modelo invalido| I
    D -->|Rate limit o no disponible| I
    D -->|Cambio parcial| I
    D -->|Error local| I

    E --> J[Verifier]
    J --> K{Gate}

    K -->|PASS| L[Aceptar]
    K -->|FAIL| M[Clasificar fallo]
    M --> N[Retry, Replan, Repair Gate o Stop]
```

## Jerarquia operativa

```mermaid
flowchart TD
    R[System Run] --> G[Goal]
    R --> RT[Route]
    R --> P[Plan opcional]
    R --> E[Execution]
    R --> V[Verification]
    R --> I[Integration]

    P --> PH[Phases]
    PH --> W[Waves]
    W --> C[Contracts]

    E --> WT[Worktrees]
    WT --> RN[Runners]
    RN --> PA[Provider Attempts]
    PA --> B[Builders]

    V --> CH[Checks]
    CH --> GT[Gates]
```

## Regla de proteccion

El Router siempre se ejecuta antes del Planner:

```text
Router antes del Planner
```

Un trabajo pequeno, venga del usuario o sea descubierto durante la ejecucion,
toma la ruta directa y no activa investigacion, opiniones, planificacion pesada
ni paralelismo. El Planner y el fan-out se reservan para trabajos con varias
partes, dependencias o incertidumbre demostrable.

## Estados del orquestador

`orchestrate.mjs` registra en `.codegen-run/<run>/events.jsonl` los eventos de
este documento y termina en uno de estos estados:

```text
COMPLETED             gate final PASS; resultado en la rama codegen/<run>
FINAL_GATE_FAILED     oleadas integradas, pero el gate final falló
DELIBERATION_REQUIRED el Goal sigue abierto: investigación, opiniones o decisiones
ROUTE_BLOCKED         Goal no sellado o sin presupuesto para la ruta
PLAN_FAILED | PLAN_INVALID | PLAN_STALE
GATE_NOT_READY        ningún gate confiable para un contrato
BUILD_FAILED          presupuesto de intentos agotado
REPLAN_REQUIRED       el Builder devolvió BLOCKED: el contrato es incorrecto
USER_ACTION_REQUIRED  saldo Zen agotado; recargar y reanudar
ESCALATE              rate limit o proveedor Go no disponible
BLOCKED               credenciales, modelo mal configurado o error local
INTEGRATION_CONFLICT  cherry-pick en conflicto (no debería ocurrir con un plan válido)
```
