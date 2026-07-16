#!/bin/bash
# run-e2e.sh — end-to-end verification of the ADW v0 lint gate (diagram 1).
# Copies the fixture project to a temp dir, installs the ADW .claude (hooks +
# settings), runs a real `claude -p` inside, then shows the gate log and diff.
# Usage: bash .claude/run-e2e.sh ["task prompt"] [--keep]
set -euo pipefail

claude_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
task="${1:-Agrega una función restar(a, b) que devuelva a - b a calculadora.py}"
keep="${2:-}"

work="$(mktemp -d /tmp/adw-e2e.XXXXXX)"
echo "→ Workspace: $work"

# 1. Install: fixture + ADW .claude (the same gesture a real target project gets)
cp -r "$claude_dir/fixture-project/." "$work/"
mkdir -p "$work/.claude/hooks"
cp "$claude_dir"/hooks/adw-*.sh "$work/.claude/hooks/"
cp "$claude_dir/settings.json" "$work/.claude/settings.json"
git -C "$work" init -q && git -C "$work" add -A && git -C "$work" -c user.email=e2e@adw -c user.name=adw commit -qm "estado inicial (con errores de lint deliberados)"

# 2. Baseline: the gate must fail before the run
echo "→ Gate lint ANTES de la corrida:"
if bash "$work/.claude/hooks/adw-gate.sh" lint "$work" > /dev/null 2>&1; then
  echo "ERROR: el fixture no tiene errores de lint — el experimento no prueba nada." >&2
  exit 1
fi
echo "   FALLA (esperado: el fixture trae errores deliberados)"

# 3. The real run: the Stop hook must keep the agent working until lint passes
echo "→ Corriendo claude -p (esto toma un rato)..."
(
  cd "$work"
  claude -p "$task" \
    --permission-mode acceptEdits \
    --max-turns 25 \
    --output-format json > claude-output.json 2> claude-stderr.log
) || echo "   (claude terminó con código $? — se evalúa por el estado del gate)"

# 4. Verdict: lint must pass now
echo "→ Gate lint DESPUÉS de la corrida:"
if bash "$work/.claude/hooks/adw-gate.sh" lint "$work"; then
  echo "   PASA ✔"
  outcome=0
else
  echo "   SIGUE FALLANDO ✘ (revisar log)"
  outcome=1
fi

# 5. Evidence for study
echo "→ Log de gates (adw-runs):"
cat "$work"/.claude/adw-runs/*.jsonl 2>/dev/null | jq -c '{ts, gate, passed, duration_ms}' || true
echo "→ Diff producido por el agente:"
git -C "$work" diff --stat
echo "→ Costo/sesión:"
jq '{session_id, total_cost_usd, num_turns, is_error}' "$work/claude-output.json" 2>/dev/null || true

if [ "$keep" = "--keep" ]; then
  echo "→ Workspace conservado para inspección: $work"
else
  echo "→ Workspace conservado (bórralo tú tras revisar): $work"
fi
exit "$outcome"
