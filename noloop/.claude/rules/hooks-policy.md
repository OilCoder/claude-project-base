---
paths: [".claude/settings.json", ".claude/settings.local.json", ".claude/hooks/**"]
---

# Hooks — política de detección

## Nunca uses el campo `if` para bloquear comandos peligrosos

`"if": "Bash(git reset --hard *)"` (o `rm -rf`, `force-push`) **no es un grep
literal sobre el texto del comando** — es el matcher heurístico interno de
Claude Code, que evalúa "riesgo" de forma difusa. Confirmado en dos
despliegues de campo independientes: sobre-dispara con bash benigno de
varias líneas, bucles `for`, heredocs y pipes con múltiples comandos
(`for ts in "a" "b"; do echo "$ts"; done` bloqueado como si fuera
`git reset --hard`). Tasa de falso positivo medida: 13/13 en los casos
rastreados; cero comandos genuinamente destructivos atrapados por ese campo
en ninguna de las dos sesiones — el costo es puro: turnos perdidos
reformulando comandos inocentes.

**Alternativa correcta**: detección literal dentro del propio script del
hook, como ya hace `adw-protect-gates.sh` — `case`/`grep -qE` sobre
`tool_input.command` parseado con `jq`. El hook se dispara siempre (sin
condicionarlo a un `if`) y decide él mismo, con texto exacto, si bloquea.

```bash
# mal — campo "if" difuso
{ "if": "Bash(git reset --hard *)", "hooks": [...] }

# bien — el script decide con grep/case literal
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
case "$cmd" in
  *"git reset --hard"*|*"rm -rf "*) echo "BLOCKED: ..." >&2; exit 2 ;;
esac
```
