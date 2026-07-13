# Opzava architecture documentation

This directory is the deep, module-level architecture documentation for the Opzava-owned codebase.
It complements `ARCHITECTURE.md` (system overview) and `CONTEXT.md` (glossary) by documenting every Module, Seam, and deepening opportunity so no agent or engineer is blinded by the codebase's shape.

It is grounded in the codebase-design vocabulary and the project's ubiquitous language, and it respects every locked ADR.

## Start here

1. [SEAM-MAP.md](SEAM-MAP.md) is the canonical map of where every Module Interface lives, with the port reality table and the three load-bearing seams.
2. [adr-seam-constraints.md](adr-seam-constraints.md) lists the 15 decisions a future change must not re-litigate.
3. [bounded-contexts.md](bounded-contexts.md) maps each bounded context to its owning package, system of record, ADR, and build status.
4. [modules/](modules/) has one deep doc per package and app.
5. [DEEPENING-OPPORTUNITIES.md](DEEPENING-OPPORTUNITIES.md) is the prioritized list of shallow-to-deep refactor candidates.

## What is in this directory

| File | What it documents |
| --- | --- |
| [SEAM-MAP.md](SEAM-MAP.md) | The seam graph: port reality table, layered dependencies, load-bearing seams, depth heat, smells. |
| [adr-seam-constraints.md](adr-seam-constraints.md) | Per-ADR seam and invariant, plus the do-not-re-litigate list. |
| [bounded-contexts.md](bounded-contexts.md) | Bounded-context ownership and cross-context dependencies. |
| [ubiquitous-language-bridge.md](ubiquitous-language-bridge.md) | Each `CONTEXT.md` term mapped to its code location. |
| [mainframe-seam.md](mainframe-seam.md) | The Opzava-to-Mainframe fork boundary and customization ladder. |
| [modules/](modules/) | Deep per-module documentation (interface, depth, seams, tests, deepening opportunity). |
| [DEEPENING-OPPORTUNITIES.md](DEEPENING-OPPORTUNITIES.md) | Prioritized refactor candidates with strength badges. |

## Vocabulary

This documentation uses the codebase-design terms exactly; do not substitute "component", "service", "API", or "boundary".

- Module: anything with an interface and an implementation.
- Interface: everything a caller must know to use the module (signature plus invariants plus ordering plus error modes).
- Implementation: what is inside a module.
- Depth: deep means lots of behavior behind a small interface; shallow means the interface is nearly as complex as the implementation.
- Seam: the location where a module's interface lives.
- Adapter: a concrete thing satisfying an interface at a seam (role, not substance).
- Leverage: what callers gain from depth (more capability per unit of interface learned).
- Locality: what maintainers gain from depth (change and bugs concentrate in one place).

Standing tests applied throughout: the deletion test (delete the module; if complexity concentrates it earned its keep, if it just moves it was a pass-through), "the interface is the test surface", and "one adapter means a hypothetical seam, two adapters means a real one".

## How this was built

The module inventories were produced by read-only analysis of the source on disk, one inventory per package group, against a repo-wide `implements <Name>Port` grep as the authoritative Adapter map.
Each per-module doc cross-checks its inventory against the real source and cites file paths.
Every Adapter count and depth claim here is verifiable by grep or by reading the cited file.
Where a claim could not be verified from source, it is marked "unverified" or "unknown".

## Relationship to the rest of the docs

- `ARCHITECTURE.md` remains the system overview (deployment topology, bounded-context map, governing principles); this directory goes one level deeper into each module.
- `CONTEXT.md` remains the canonical glossary; [ubiquitous-language-bridge.md](ubiquitous-language-bridge.md) only maps those terms to code, it does not redefine them.
- `docs/adr/` remains the decision record; [adr-seam-constraints.md](adr-seam-constraints.md) only extracts the seam-relevant subset.
