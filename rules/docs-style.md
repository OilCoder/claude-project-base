---
paths:
  - "**/*.md"
  - "docs/**/*"
---

<!-- description: Define standards for documentation files -->

# Docs Style

All technical documentation must reflect the actual behavior of the code — not future plans or assumptions.

## Docs root folder

- Documentation location: defined per project (`docs/`, `obsidian-vault/`, etc.).
- Auto-generated content must not be placed in the docs folder.
- If the project uses bilingual docs, organize by language subfolder (e.g., `English/`, `Spanish/`).

## Filename convention

- See `file-naming.md` for naming guidance.
- Pattern: `NN_<slug>.md` for ordered docs.

## Required sections

Every documentation file must include:

1. **Title and Purpose** — Start with a single sentence summarizing the module's role.
2. **Workflow Description** — Describe the sequence of operations performed. Use numbered steps or descriptive text. Include a Mermaid diagram (`flowchart TD` or `graph LR`) if the flow is complex.
3. **Inputs and Outputs** — List each parameter with name, type, and purpose. Describe expected output(s) and their structure.
4. **Mathematical Explanation** (if applicable) — Use LaTeX or pseudocode for formulas.
5. **Code Reference** — Always include the source module path (e.g., `Source: src/module.py`).

## Style

- Write clearly and concisely. Use short paragraphs and examples when helpful.
- Document only what exists in the current version of the code.
- Avoid TODOs and speculative notes.
- Each document must be self-contained — readable without prior context.

## Cross-references

- See `doc-enforcement.md` for inline docstring standards.
- See `document/SKILL.md` for the on-demand documentation generation workflow.
