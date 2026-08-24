#!/usr/bin/env python3
"""Prepare, build, and serially integrate a bounded ADW phase wave."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class WaveError(RuntimeError):
    pass


def run(
    args: list[str], cwd: Path, *, env: dict[str, str] | None = None, check: bool = True
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        args, cwd=cwd, env=env, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, check=False,
    )
    if check and result.returncode:
        raise WaveError(f"command failed ({result.returncode}): {' '.join(args)}\n{result.stdout}")
    return result


def git(project: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return run(["git", *args], project, check=check)


def integration_status(project: Path) -> str:
    return git(
        project,
        "status",
        "--porcelain",
        "--",
        ".",
        ":!adw/waves",
        ":!adw/state.md",
        ":!adw/log.md",
        ":!.claude/adw-runs",
        ":!.claude/worktrees",
    ).stdout.strip()


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise WaveError(f"cannot read manifest {path}: {error}") from error


def save_manifest(path: Path, manifest: dict[str, Any]) -> None:
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def project_path(project: Path, raw: str, label: str) -> Path:
    path = (project / raw).resolve() if not Path(raw).is_absolute() else Path(raw).resolve()
    try:
        path.relative_to(project)
    except ValueError as error:
        raise WaveError(f"{label} escapes the project: {raw}") from error
    return path


def phase_number(phase: dict[str, Any]) -> int:
    phase_id = phase.get("phase_id", "")
    if not isinstance(phase_id, str) or not phase_id.startswith("phase-"):
        raise WaveError(f"invalid phase_id: {phase_id!r}")
    try:
        return int(phase_id.removeprefix("phase-"))
    except ValueError as error:
        raise WaveError(f"invalid phase_id: {phase_id!r}") from error


def validate(project: Path, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    required = {"schema_version", "wave_id", "cycle_branch", "integration_head", "phases"}
    missing = sorted(required - manifest.keys())
    if missing:
        raise WaveError(f"manifest missing fields: {', '.join(missing)}")
    if manifest["schema_version"] != 1:
        raise WaveError("unsupported schema_version")
    phases = manifest["phases"]
    if not isinstance(phases, list) or not 1 <= len(phases) <= 2:
        raise WaveError("a wave must contain one or two phases")

    integrated_phases = manifest.get("integrated_phases", [])
    if not isinstance(integrated_phases, list):
        raise WaveError("integrated_phases must be a list")
    ids: set[str] = set()
    owners: dict[str, str] = {}
    for phase in phases:
        number = phase_number(phase)
        phase_id = phase["phase_id"]
        if phase_id in ids:
            raise WaveError(f"duplicate phase: {phase_id}")
        ids.add(phase_id)
        for field in ("depends_on", "owned_files"):
            if not isinstance(phase.get(field), list):
                raise WaveError(f"{phase_id}.{field} must be a list")
        if not phase["owned_files"]:
            raise WaveError(f"{phase_id} has no owned_files")
        for owned in phase["owned_files"]:
            if owned in owners:
                raise WaveError(f"owned file collision: {owned} ({owners[owned]}, {phase_id})")
            owners[owned] = phase_id
        if phase_id in phase["depends_on"]:
            raise WaveError(f"{phase_id} depends on itself")
        wave_ids = {p.get("phase_id") for p in phases}
        if any(dependency in wave_ids for dependency in phase["depends_on"]):
            raise WaveError(f"{phase_id} depends on a phase in the same wave")
        missing_dependencies = sorted(set(phase["depends_on"]) - set(integrated_phases))
        if missing_dependencies:
            raise WaveError(
                f"{phase_id} has dependencies not recorded as integrated: "
                f"{', '.join(missing_dependencies)}"
            )
        if int(phase.get("loop_backs", 0)) > 3:
            raise WaveError(f"{phase_id} exceeded three loop-backs")
        if phase.get("risk", "low") not in {"low", "medium", "high"}:
            raise WaveError(f"{phase_id} has invalid risk")
        phase.setdefault("risk", "low")
        phase.setdefault("loop_backs", 0)
        phase.setdefault("builder_status", "pending")
        phase.setdefault("verdict", "pending")
        phase.setdefault("integration_status", "pending")
        phase.setdefault("base_commit", manifest["integration_head"])
        if phase["base_commit"] != manifest["integration_head"]:
            raise WaveError(f"{phase_id} does not use integration_head as base")
        project_path(project, phase.get("worktree", f".claude/worktrees/{manifest['wave_id']}-{phase_id}"), "worktree")
        if not phase.get("branch"):
            raise WaveError(f"{phase_id} is missing branch")
        if phase["branch"].startswith(f"{manifest['cycle_branch']}/"):
            raise WaveError(
                f"{phase_id} branch cannot be nested below cycle_branch; "
                "use adw-wave/<slug>/wave-N-phase-M"
            )
        if not phase.get("gate_commit"):
            raise WaveError(f"{phase_id} is missing gate_commit")
        git(project, "cat-file", "-e", f"{phase['gate_commit']}^{{commit}}")
        for artifact in (
            project / f"adw/dispatch/phase-{number}.md",
            project / f"adw/dispatch/phase-{number}.files",
            project / f"adw/gates/phase-{number}.sh",
        ):
            if not artifact.is_file():
                raise WaveError(f"missing sealed phase artifact: {artifact.relative_to(project)}")
        allowed_path = project / f"adw/dispatch/phase-{number}.files"
        allowed = {
            line.split("#", 1)[0].strip()
            for line in allowed_path.read_text(encoding="utf-8").splitlines()
            if line.split("#", 1)[0].strip()
        }
        if allowed != set(phase["owned_files"]):
            raise WaveError(f"{phase_id} owned_files differ from its sealed allowlist")
        gate_path = f"adw/gates/phase-{number}.sh"
        if git(project, "diff", "--quiet", phase["gate_commit"], "--", gate_path, check=False).returncode:
            raise WaveError(f"sealed gate changed after gate_commit: {gate_path}")
    git(project, "cat-file", "-e", f"{manifest['integration_head']}^{{commit}}")
    return sorted(phases, key=phase_number)


def capture_gpu_snapshot(project: Path) -> dict[str, Any]:
    snapshot: dict[str, Any] = {"captured_at": datetime.now(timezone.utc).isoformat()}
    gpu = run(
        ["nvidia-smi", "--query-gpu=memory.total,memory.free", "--format=csv,noheader,nounits"],
        project, check=False,
    )
    snapshot["nvidia_smi_rc"] = gpu.returncode
    if gpu.returncode == 0 and gpu.stdout.strip():
        first = gpu.stdout.strip().splitlines()[0].split(",")
        snapshot["total_vram_mb"] = int(first[0].strip())
        snapshot["free_vram_mb"] = int(first[1].strip())
    ollama = run(["ollama", "ps"], project, check=False)
    snapshot["ollama_ps_rc"] = ollama.returncode
    snapshot["ollama_ps"] = ollama.stdout.strip()[-4000:]
    lowered = ollama.stdout.lower()
    snapshot["offload_detected"] = "cpu" in lowered or "mixed" in lowered
    snapshot["active_models"] = max(0, len(ollama.stdout.strip().splitlines()) - 1)
    snapshot["loaded_models"] = [
        line.split()[0] for line in ollama.stdout.strip().splitlines()[1:] if line.split()
    ]
    return snapshot


def local_grant(snapshot: dict[str, Any], expected_model: str = "") -> int:
    if snapshot.get("nvidia_smi_rc") != 0 or snapshot.get("ollama_ps_rc") != 0:
        return 0
    if snapshot.get("offload_detected"):
        return 0
    # A loaded model only guarantees VRAM residency for ITSELF. Granting on a
    # foreign resident model would evict it or force offload mid-wave.
    if expected_model and expected_model in snapshot.get("loaded_models", []):
        return 1
    minimum_free = int(os.environ.get("ADW_LOCAL_MIN_FREE_VRAM_MB", "12000"))
    return 1 if snapshot.get("free_vram_mb", 0) >= minimum_free else 0


def prepare(project: Path, path: Path, manifest: dict[str, Any]) -> None:
    phases = validate(project, manifest)
    if integration_status(project):
        raise WaveError("integration worktree must be clean before preparing a wave")
    for phase in phases:
        worktree = project_path(
            project,
            phase.get("worktree", f".claude/worktrees/{manifest['wave_id']}-{phase['phase_id']}"),
            "worktree",
        )
        phase["worktree"] = str(worktree.relative_to(project))
        if worktree.exists():
            head = git(worktree, "rev-parse", "HEAD").stdout.strip()
            if head != manifest["integration_head"]:
                raise WaveError(f"existing worktree has wrong base: {phase['phase_id']}")
            branch = git(worktree, "branch", "--show-current").stdout.strip()
            if branch != phase["branch"]:
                raise WaveError(f"existing worktree has wrong branch: {phase['phase_id']}")
            if integration_status(worktree):
                raise WaveError(f"existing worktree is dirty: {phase['phase_id']}")
        else:
            worktree.parent.mkdir(parents=True, exist_ok=True)
            git(project, "worktree", "add", "-b", phase["branch"], str(worktree), manifest["integration_head"])
        phase["builder_status"] = "ready"
    manifest["status"] = "ready"
    save_manifest(path, manifest)


def newest_artifacts(worktree: Path, number: int) -> str | None:
    root = worktree / f".claude/adw-runs/builders/phase-{number}"
    candidates = sorted((p for p in root.iterdir() if p.is_dir()), reverse=True) if root.is_dir() else []
    return str(candidates[0]) if candidates else None


def dispatch(project: Path, phase: dict[str, Any], engine_mode: str) -> tuple[int, str, str | None]:
    number = phase_number(phase)
    worktree = project_path(project, phase["worktree"], "worktree")
    script = worktree / ".claude/skills/adw/scripts/dispatch-builder.sh"
    env = os.environ.copy()
    env["CLAUDE_PROJECT_DIR"] = str(worktree)
    env["ADW_ENGINE_MODE"] = engine_mode
    if engine_mode == "cloud-only":
        env["ADW_SKIP_LOCAL"] = "1"
    result = run(["bash", str(script), str(number)], worktree, env=env, check=False)
    log = worktree / f".claude/adw-runs/wave-{phase['phase_id']}-{engine_mode}.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(result.stdout, encoding="utf-8")
    return result.returncode, result.stdout, newest_artifacts(worktree, number)


def build(project: Path, path: Path, manifest: dict[str, Any]) -> None:
    phases = validate(project, manifest)
    if any(phase["builder_status"] not in {"ready", "cloud_pending", "passed"} for phase in phases):
        raise WaveError("all phases must be ready, cloud_pending, or passed")
    cloud: list[dict[str, Any]] = []
    manifest["status"] = "building"
    for phase in phases:
        if phase["builder_status"] == "passed":
            continue
        if phase["builder_status"] == "cloud_pending":
            cloud.append(phase)
            continue
        if phase["risk"] in {"medium", "high"}:
            phase["builder_status"] = "cloud_pending"
            cloud.append(phase)
            save_manifest(path, manifest)
            continue
        snapshot = capture_gpu_snapshot(project)
        manifest["gpu_snapshot"] = snapshot
        grant = local_grant(snapshot, os.environ.get("ADW_LOCAL_MODEL", ""))
        manifest["limits"] = {"local": grant, "cloud": 2, "claude": 0}
        save_manifest(path, manifest)
        if grant == 0:
            raise WaveError("dynamic GPU policy withheld the required local grant")
        phase["builder_status"] = "running"
        save_manifest(path, manifest)
        rc, output, artifacts = dispatch(project, phase, "local-only")
        phase["artifacts"] = artifacts
        if rc == 0:
            phase["engine"] = "local"
            phase["builder_status"] = "passed"
        elif rc == 10:
            phase["builder_status"] = "cloud_pending"
            cloud.append(phase)
        else:
            phase["builder_status"] = "failed"
            manifest["status"] = "failed"
            save_manifest(path, manifest)
            raise WaveError(f"local dispatch failed for {phase['phase_id']} (rc={rc})\n{output}")
        save_manifest(path, manifest)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(dispatch, project, phase, "cloud-only"): phase for phase in cloud}
        for future in as_completed(futures):
            phase = futures[future]
            rc, output, artifacts = future.result()
            phase["artifacts"] = artifacts
            phase["engine"] = "cloud"
            phase["builder_status"] = "passed" if rc == 0 else "escalated" if rc == 20 else "failed"
            save_manifest(path, manifest)
            if rc not in {0, 20}:
                manifest["status"] = "failed"
                save_manifest(path, manifest)
                raise WaveError(f"cloud dispatch failed for {phase['phase_id']} (rc={rc})\n{output}")
    manifest["status"] = "built" if all(p["builder_status"] == "passed" for p in phases) else "escalated"
    save_manifest(path, manifest)


def integration_gate(project: Path, number: int) -> None:
    gate = project / f"adw/gates/phase-{number}.sh"
    gate_timeout = os.environ.get("ADW_GATE_TIMEOUT_SECONDS", "300")
    result = run(["timeout", gate_timeout, "bash", str(gate)], project, check=False)
    if result.returncode:
        raise WaveError(f"phase integration gate failed ({result.returncode})\n{result.stdout}")


def integrate(project: Path, path: Path, manifest: dict[str, Any]) -> None:
    phases = validate(project, manifest)
    if git(project, "branch", "--show-current").stdout.strip() != manifest["cycle_branch"]:
        raise WaveError("integration worktree is not on cycle_branch")
    if integration_status(project):
        raise WaveError("integration worktree must be clean")
    if git(project, "rev-parse", "HEAD").stdout.strip() != manifest["integration_head"]:
        raise WaveError("integration HEAD differs from manifest integration_head")
    manifest["status"] = "integrating"
    save_manifest(path, manifest)
    for phase in phases:
        if phase.get("verdict") != "pass" or not phase.get("verified_commit"):
            raise WaveError(f"{phase['phase_id']} lacks PASS verdict and verified_commit")
        git(project, "cat-file", "-e", f"{phase['verified_commit']}^{{commit}}")
        ancestry = git(
            project, "merge-base", "--is-ancestor", phase["base_commit"],
            phase["verified_commit"], check=False,
        )
        if ancestry.returncode:
            raise WaveError(f"{phase['phase_id']} verified_commit is not based on base_commit")
        changed = {
            line for line in git(
                project, "diff", "--name-only", phase["base_commit"],
                phase["verified_commit"],
            ).stdout.splitlines() if line
        }
        # AGENTS.md is method infrastructure sealed by the dispatcher, not
        # phase work. Builder edits to it are already rejected by the
        # runner's own scope check (it is never in an allowlist).
        outside = sorted(changed - set(phase["owned_files"]) - {"AGENTS.md"})
        if outside:
            raise WaveError(
                f"{phase['phase_id']} verified_commit is out of scope: {', '.join(outside)}"
            )
        result = git(project, "merge", "--no-ff", "--no-edit", phase["verified_commit"], check=False)
        if result.returncode:
            git(project, "merge", "--abort", check=False)
            phase["integration_status"] = "conflict"
            manifest["status"] = "failed"
            save_manifest(path, manifest)
            raise WaveError(f"merge conflict for {phase['phase_id']}\n{result.stdout}")
        try:
            integration_gate(project, phase_number(phase))
        except WaveError:
            phase["integration_status"] = "gate_failed"
            manifest["status"] = "failed"
            save_manifest(path, manifest)
            raise
        phase["integration_status"] = "passed"
        manifest["integration_head"] = git(project, "rev-parse", "HEAD").stdout.strip()
        save_manifest(path, manifest)
    manifest["status"] = "passed"
    save_manifest(path, manifest)


def cleanup(project: Path, path: Path, manifest: dict[str, Any]) -> None:
    for phase in manifest.get("phases", []):
        if phase.get("integration_status") != "passed" or not phase.get("worktree"):
            continue
        worktree = project_path(project, phase["worktree"], "worktree")
        if worktree.exists():
            git(project, "worktree", "remove", str(worktree))
        phase["worktree_removed"] = True
    git(project, "worktree", "prune")
    save_manifest(path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("validate", "prepare", "build", "integrate", "cleanup"))
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--project", type=Path, default=Path.cwd())
    args = parser.parse_args()
    project = args.project.resolve()
    path = args.manifest.resolve()
    try:
        manifest = load_manifest(path)
        if args.command == "validate":
            validate(project, manifest)
        elif args.command == "prepare":
            prepare(project, path, manifest)
        elif args.command == "build":
            build(project, path, manifest)
        elif args.command == "integrate":
            integrate(project, path, manifest)
        else:
            cleanup(project, path, manifest)
    except WaveError as error:
        print(f"WAVE ERROR: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
