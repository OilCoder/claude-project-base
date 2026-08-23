#!/usr/bin/env python3
"""Normalize Codex events and append one metric record per attempt."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def walk(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def token_usage(events: Path) -> tuple[int, int]:
    tokens_in = 0
    tokens_out = 0
    if not events.exists():
        return tokens_in, tokens_out
    for line in events.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        for item in walk(event):
            tokens_in = max(tokens_in, int(item.get("input_tokens", 0) or 0))
            tokens_out = max(tokens_out, int(item.get("output_tokens", 0) or 0))
    return tokens_in, tokens_out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--events", type=Path, required=True)
    parser.add_argument("--metrics", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--contract", required=True)
    parser.add_argument("--engine", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--attempt", type=int, required=True)
    parser.add_argument("--gate", required=True)
    parser.add_argument("--duration", type=int, required=True)
    parser.add_argument("--files", default="")
    parser.add_argument("--outside", choices=("true", "false"), required=True)
    parser.add_argument("--gate-touched", choices=("true", "false"), required=True)
    parser.add_argument("--note", default="")
    args = parser.parse_args()

    tokens_in, tokens_out = token_usage(args.events)
    metric = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "run_id": args.run_id,
        "contract": args.contract,
        "model": args.model,
        "engine": args.engine,
        "attempt": args.attempt,
        "gate": args.gate,
        "touched_files": [line for line in args.files.splitlines() if line],
        "out_of_scope": args.outside == "true",
        "gate_touched": args.gate_touched == "true",
        "duration_s": args.duration,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "notes": args.note,
    }
    args.metrics.parent.mkdir(parents=True, exist_ok=True)
    with args.metrics.open("a", encoding="utf-8") as output:
        output.write(json.dumps(metric, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
