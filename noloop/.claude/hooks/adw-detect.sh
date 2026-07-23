#!/bin/bash
# adw-detect.sh — resolve the shell command for a named gate in a target project.
# Usage: adw-detect.sh <lint|format|test> [project_dir]
# Prints the command to stdout, or nothing if the gate does not apply.
# Resolution order: adw-gates.conf override > stack autodetection (Python, JS).
set -u

gate="${1:?usage: adw-detect.sh <lint|format|test> [project_dir]}"
proj="${2:-${CLAUDE_PROJECT_DIR:-$PWD}}"

# 1. Per-project override: adw-gates.conf with lines like `lint=ruff check .`
conf="$proj/adw-gates.conf"
if [ -f "$conf" ]; then
  line=$(grep -E "^${gate}=" "$conf" 2>/dev/null | tail -1)
  if [ -n "$line" ]; then
    printf '%s\n' "${line#*=}"
    exit 0
  fi
fi

# 2. Python project
if [ -f "$proj/pyproject.toml" ] || compgen -G "$proj/*.py" > /dev/null; then
  # ruff on PATH beats uvx (uvx downloads on first use but needs no install)
  ruff_cmd=""
  if command -v ruff > /dev/null 2>&1; then
    ruff_cmd="ruff"
  elif command -v uvx > /dev/null 2>&1; then
    ruff_cmd="uvx ruff"
  fi
  case "$gate" in
    lint)
      if [ -n "$ruff_cmd" ]; then echo "$ruff_cmd check ."; fi
      ;;
    format)
      if [ -n "$ruff_cmd" ]; then echo "$ruff_cmd format --check ."; fi
      ;;
    test)
      if [ -d "$proj/tests" ]; then
        if [ -f "$proj/uv.lock" ]; then
          echo "uv run pytest -x -q"
        elif command -v pytest > /dev/null 2>&1; then
          echo "pytest -x -q"
        elif command -v uvx > /dev/null 2>&1; then
          echo "uvx pytest -x -q"
        fi
      fi
      ;;
  esac
  exit 0
fi

# 3. JS/TS project
if [ -f "$proj/package.json" ]; then
  case "$gate" in
    lint)   echo "npx --no-install eslint ." ;;
    format) echo "npx --no-install prettier --check ." ;;
    test)   echo "npm test --silent" ;;
  esac
  exit 0
fi

# Unknown stack: no gates (the Stop hook treats "no command" as pass).
exit 0
