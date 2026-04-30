# Changelog

All notable changes to claude-project-base.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-29

First versioned release. The base now ships as a Claude Code plugin.

### Added

- Plugin manifest `.claude-plugin/plugin.json` for installation via `/plugin install`.
- README.md with quickstart.
- This CHANGELOG.md.
- **`memory-policy.md`** rule differentiating bitácora (human, narrative) from MEMORY.md (Claude, factual).
- **`commit-style.md`** rule with the Conventional Commits 7-prefix subset (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`).
- **`/bug-fix`** skill: TDD workflow (reproduce → failing test → fix → confirm → bitácora). Always commits with `fix:` prefix.
- **Implementer agent**: autonomous code writer with rules preloaded (`code-style`, `verification`, `doc-enforcement`, `file-naming`, `logging-policy`).
- **`pipeline/`** added to path-scoped rules (`doc-enforcement.md`) and to `check-debug-isolation.sh` source folder detection.
- **Hook robustness pass**: 4 hooks now have timeouts (2-10s), error logging to `.claude/hooks.log`, and graceful fallbacks (never block sessions).

### Changed

- **`/setup` simplified**: now asks only 2 questions (project name, stack). Creates only 4 folders (`.claude/`, `todo/`, `documentation/`, `docs/`). Other folders (`src/`, `pipeline/`, etc.) are created organically by the user when needed.
- **Documentation split fixed**: `documentation/` for code docs (target of `/document`), `docs/` reserved exclusively for GitHub Pages. `docs-style.md`, `/document`, and `/doc-enforce` updated accordingly.
- **`/checkpoint`**: now applies the correct commit prefix automatically based on the dominant nature of changes.
- **`code-style.md`**: removed numeric "40 lines" function length limit (delegated to linters via hooks).
- **All skills**: `allowed-tools` reformatted from comma-separated to space-separated per official spec; Bash permissions granularized per skill.
- **`/debug` renamed to `/investigate`** to avoid collision with bundled Claude Code skills.
- **Rule frontmatter**: `description:` field moved to HTML comments (not a documented rules field).
- **Path-scoped rules**: `docs-style.md`, `plan-format.md`, `doc-enforcement.md` now use `paths:` frontmatter to load only when relevant files are open.

### Fixed

- Skills `allowed-tools` format aligned with official spec (space-separated, granular `Bash(cmd *)`).
- Hooks no longer fail silently — failures log to `.claude/hooks.log` with timestamp.

### Architecture: the four layers

This release formalizes the four-layer enforcement model:

| Layer | Role |
|---|---|
| **Rules** | Advisory context loaded into Claude |
| **Skills** | On-demand workflows (may pre-render shell context) |
| **Agents** | Specialized assistants in fresh context |
| **Hooks** | Deterministic actions on tool events |

`delegation.md` codifies the decision criteria for which layer to use.

---

## [0.0.1] — Initial commit

Initial draft of rules and skills as a copy/paste template (pre-plugin).
