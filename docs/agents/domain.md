# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: one `CONTEXT.md` at the root, and decision records under `docs/ard/`.

> Note: this repo calls its decision records **ARDs** and stores them in `docs/ard/` (not `docs/adr/`). Everywhere the skills say "ADR", read it as "ARD" and look in `docs/ard/`.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the product/brand and domain-language contract.
- **`docs/ard/`** — read the ARDs that touch the area you're about to work in (currently `0001`–`0014`).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grilling` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/ard/
│   ├── 0001-use-mission-control-as-base.md
│   ├── 0002-require-local-rnd-and-measurement-gates.md
│   └── ...
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ARD conflicts

If your output contradicts an existing ARD, surface it explicitly rather than silently overriding:

> _Contradicts ARD-0011 (single-orchestrator execution model) — but worth reopening because…_
