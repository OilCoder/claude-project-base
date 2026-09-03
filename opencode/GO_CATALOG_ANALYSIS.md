# Análisis del catálogo OpenCode Go para el primer nivel

**Fecha:** 2026-09-03<br>
**Fuente del catálogo:** `opencode models opencode-go` (26 modelos) y la tabla de precios de https://opencode.ai/docs/go/<br>
**Cuota Go:** 12 USD de valor por ventana de 5 h, 30 USD por semana, 60 USD por mes. Las "peticiones" de la tabla son el estimado del propio OpenCode para cada modelo.

Toda la evidencia de capacidad que aparece abajo es **reportada por el fabricante (nivel C del espec)** salvo donde se indica. Ningún modelo pasa a `qualified` con esto; sirve para decidir qué smokes correr y con qué rol.

## 1. Catálogo Go con precio y cuota

| Modelo | Entrada / salida (USD por 1M) | Caché | Peticiones / 5 h | Contexto |
|---|---|---|---|---|
| grok-4.6 | 2.00 / 6.00 (≤200K) · 4.00 / 12.00 (>200K) | 0.50 | 169 | 500K |
| gpt-5.6-luna | 0.20 / 1.20 (≤272K) · 0.40 / 1.80 (>272K) | 0.02 | 2 050 | >272K |
| glm-5.3 | 1.40 / 4.40 | 0.26 | 220 | por confirmar |
| glm-5.3-flash | 0.15 / 0.50 | 0.03 | 1 580 | por confirmar |
| glm-5.2, glm-5.1 | 1.40 / 4.40 | 0.26 | 880 | por confirmar |
| kimi-k3 | 3.00 / 15.00 | 0.30 | 110 | 1M |
| kimi-k2.7-code | 0.95 / 4.00 | 0.19 | 1 350 | por confirmar |
| kimi-k2.6 | 0.95 / 4.00 | 0.16 | 1 150 | por confirmar |
| qwen3.8-max | 2.00 / 6.00 | 0.25 | 160 | 1M |
| qwen3.8-flash | 0.15 / 0.47 | 0.016 | 5 400 | por confirmar |
| qwen3.7-max | 2.50 / 7.50 | 0.50 | 170 | por confirmar |
| qwen3.7-plus | 0.40 / 1.60 (≤256K) | 0.04 | 4 300 | >256K |
| qwen3.6-plus | 0.50 / 3.00 (≤256K) | 0.05 | 3 300 | >256K |
| minimax-m3 | 0.30 / 1.20 | 0.06 | 3 200 | 1M |
| minimax-m2.7 | 0.30 / 1.20 | 0.06 | 3 400 | 204K (pool actual) |
| deepseek-v4-pro | 0.66 / 1.98 valle · 1.32 / 3.96 pico | 0.022 | 1 050 | 1M |
| deepseek-v4-flash | 0.22 / 0.66 valle · 0.44 / 1.32 pico | 0.007 | 7 600 | por confirmar |
| mimo-v2.5-pro | 0.435 / 0.87 | 0.0036 | 3 250 | por confirmar |
| mimo-v2.5 | 0.14 / 0.28 | 0.0028 | 30 100 | por confirmar |
| hy4-preview | 0.834 / 2.501 | 0.042 | 1 350 | por confirmar |
| hy3 | 0.14 / 0.58 | 0.035 | 4 300 | por confirmar |
| longcat-2.0 | 0.30 / 1.20 | 0.006 | 11 400 | por confirmar |
| muse-spark-1.2 / 1.3 | 0.10 / 0.20 | 0.002 | 45 300 | por confirmar |

Corrección respecto a lo que asumí antes: Go **sí** incluye un modelo propietario, `gpt-5.6-luna` de OpenAI. Sigue sin incluir Claude ni Gemini.

## 2. Evidencia pública encontrada

| Modelo | SWE-bench | Terminal-Bench | Nivel | Notas |
|---|---|---|---|---|
| minimax-m3 | Verified 80.5 % (4 corridas, scaffold Claude Code) | 2.1: 66.0 % (Terminus 2) | C | Lanzado 2026-06-01, 428B MoE, 1M contexto. Mismo precio que M2.7. |
| deepseek-v4-pro | Verified 80.6 % (variante Pro-Max) | 2.1: 87.9 % harness propio · **54.7 % con Terminus 2** | C / B | La brecha de 33 puntos entre harness propio e independiente es la señal más importante de toda la tabla. |
| mimo-v2.5-pro | Verified 78.9 % · Pro 57.2 % | 2.0: 68.4 % | C | 1T MoE, 2026-04-22. Mejor relación capacidad/precio del catálogo. |
| kimi-k3 | FrontierSWE 81.2 | 2.0/2.1: 88.3 % | C | 2.8T MoE, 1M contexto. Solo 110 peticiones por 5 h en Go. |
| qwen3.8-max | Pro 67.7 % (Verified sin publicar; Qwen3.7-Max: Verified 80.4 %) | por confirmar | C | 2.4T MoE, 1M contexto, 2026-08-03. |
| gpt-5.6-luna | Pro 62.7 % | 2.1: 84.7 % | C | Diseñado para automatizaciones en segundo plano; 90 % de reutilización de caché. Muy barato en cuota. |
| grok-4.6 | 95.6 % en SWE-bench según Vals (independiente; variante del benchmark por confirmar) | por confirmar | B / C | LiveBench muestra regresión en coding agéntico (54.2 frente a 56.5 de Grok 4.5). Caro en cuota. |
| glm-5.3 | por confirmar | 3.0: 28.3 (no comparable con 2.x) | C | Actual primario del Planner. Es el que menos evidencia tiene de los ocho. |
| resto (flash, hy, longcat, muse, mimo-v2.5) | por confirmar | por confirmar | — | Sin datos buscados aún. |

Leaderboards oficiales (swebench.com, tbench.ai, aider.chat, artificialanalysis.ai) no se pudieron leer de forma automática: se renderizan con JavaScript. Las cifras vienen de las fuentes listadas al final, que a su vez citan a los fabricantes.

## 3. Lectura por rol

**Builder (contratos locales y de repositorio).** Tres candidatos claros para el primer nivel, todos baratos en cuota:

1. `minimax-m3`: mismo precio que M2.7 con Verified 80.5 y 1M de contexto. Candidato a reemplazar a M2.7 como primario.
2. `mimo-v2.5-pro`: Verified 78.9 a 0.435 / 0.87. Segunda familia.
3. `kimi-k2.7-code`: ya con smoke PASS. Tercera familia.
4. `deepseek-v4-pro` para riesgo medio, solo si el smoke confirma la cifra independiente y no la propia.

**Planner y Goal Manager.** `glm-5.3` es el primario actual con la evidencia más débil. Alternativas Go mejor documentadas: `gpt-5.6-luna` (agéntico, barato, 272K) y `qwen3.8-max` o `deepseek-v4-pro` cuando el repositorio exija 1M de contexto.

**Researcher, Advisors y Reconciler.** Sus rutas automáticas usan Go. Hay cuatro familias admitidas por smoke (GPT, DeepSeek, MiniMax y MiMo); `kimi-k3` conviene reservarlo para Reconciler o riesgo alto cuando sea admitido, por su cuota de unas 110 peticiones por 5 h.

**Gate Designer y contratos triviales.** El nivel flash (`qwen3.8-flash`, `glm-5.3-flash`, `deepseek-v4-flash`, `mimo-v2.5`) no tiene evidencia todavía; vale la pena un smoke porque multiplica por diez las peticiones disponibles.

**Descartar por ahora:** `grok-4.6` (caro en cuota y con regresión agéntica reportada), `qwen3.7-max` (más caro que 3.8-max sin ventaja), `muse-spark`, `longcat` y `hy` hasta tener alguna cifra.

## 4. Plan de smokes propuesto

Cada smoke del builder cuesta entre 0.002 y 0.02 USD de valor de cuota. El fixture y el script `run-builder-smoke.sh` ya existen.

| Orden | Modelo | Rol | Motivo |
|---|---|---|---|
| 1 | minimax-m3 | Builder | posible nuevo primario |
| 2 | mimo-v2.5-pro | Builder | mejor precio con evidencia |
| 3 | gpt-5.6-luna | Builder y Planner | candidato a Planner |
| 4 | deepseek-v4-pro | Builder | verificar la cifra independiente |
| 5 | qwen3.8-flash, glm-5.3-flash | Builder | nivel barato para gate-designer |
| 6 | qwen3.8-max | Planner | contexto 1M |

Después de los smokes: actualizar `model-pools.json` con las nuevas configuraciones `candidate` y las rutas `research-synthesis` e `independent-analysis` en Go. Los smokes Zen se conservan como evidencia separada, no como fallback automático.

## 5. Resultado de los smokes (2026-09-03)

Fixture `safe_divide`, un intento, contrato sellado. Valor de cuota Go y costo real Zen por corrida.

| Modelo | Go | Zen | Pasos | Duración Go | Cuota Go (USD) | Costo Zen (USD) |
|---|---|---|---|---|---|---|
| minimax-m3 | PASS | PASS | 6 | 16 s | 0.0043 | 0.0054 |
| mimo-v2.5-pro | PASS | no existe en Zen | 5 | 16 s | 0.0031 | — |
| gpt-5.6-luna | PASS | PASS | 5 | 11 s | 0.0019 | 0.0019 |
| deepseek-v4-pro | PASS | PASS | 6 | 16 s | 0.0060 | 0.0254 |
| qwen3.8-flash | PASS | no existe en Zen | 6 | 22 s | 0.0021 | — |
| glm-5.3-flash | PASS | no existe en Zen | 6 | 38 s | 0.0010 | — |

Cambios aplicados a `model-pools.json`:

- Nuevo primario del Builder: `minimax-m3`. `minimax-m2.7` queda como alternativa.
- `mimo-v2.5-pro`, `qwen3.8-flash` y `glm-5.3-flash` entran como configuraciones solo Go. Los dos flash quedan limitados a `localized-low-risk-code-change` y riesgo bajo hasta tener evidencia.
- `gpt-5.6-luna`, `deepseek-v4-pro` y `minimax-m3` entran también en `complex-engineering-plan`, `research-synthesis`, `independent-analysis` y `orchestration`. Con `mimo-v2.5-pro`, investigación y opiniones tienen cuatro familias en Go (gpt, deepseek, minimax, mimo) sin pasar por OpenRouter.
- `glm-5.3` sigue como primario del Planner porque es el único con smoke de Planner; `gpt-5.6-luna` es el segundo candidato y necesita ese smoke.
- `kimi-k3` y `qwen3.8-max` registrados en estado `watch` en Go, sin smoke, para no gastar su cuota escasa todavía.
- Nada pasa a `qualified`: la evidencia sigue siendo del fabricante (nivel C) o inexistente (nivel D para los flash).
- Decisión operativa posterior: las rutas prefieren Go y usan Zen solo cuando ningún candidato Go cumple los requisitos de capacidad, riesgo o contexto. `Use balance` continúa la misma solicitud Go con créditos Zen al alcanzar un límite; nunca dispara una selección distinta. Si no quedan créditos, termina en `ZEN_BALANCE_EXHAUSTED` y solicita recarga.

## Fuentes consultadas

- https://opencode.ai/docs/go/ (catálogo, precios y cuota)
- https://www.minimax.io/blog/minimax-m3 y https://benchlm.ai/models/minimax-m3
- https://www.morphllm.com/deepseek-v4 y https://www.mindstudio.ai/blog/deepseek-v4-pro-0813-benchmark-review
- https://huggingface.co/XiaomiMiMo/MiMo-V2.5-Pro y https://openrouter.ai/xiaomi/mimo-v2.5-pro/benchmarks
- https://www.morphllm.com/kimi-k3 y https://emergent.sh/learn/kimi-k3-benchmark
- https://www.datacamp.com/blog/qwen3-8-max y https://www.yottalabs.ai/post/qwen-3-8-benchmarks-what-is-verified-2026
- https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/ y https://www.vellum.ai/blog/gpt-5-6-benchmarks-explained
- https://codersera.com/blog/grok-4-6-benchmarks-explained-2026/ y https://emergent.sh/learn/grok-4-6-benchmarks
- https://emergent.sh/learn/glm-5-3-benchmarks y https://benchlm.ai/models/glm-5-3
