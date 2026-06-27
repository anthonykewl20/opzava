<!-- agent-context: read this before editing the module -->

# modules/projects

## Purpose
Owns the **project profile overlay** — the Engine-B layer that turns an inherited project row into an Essential workspace: its archetype (`type`), the tiles it shows (`enabledTiles`), and presentation (`cover`, `blurb`). This is the foundation of the UX-redesign Essential core (wiring `91` Phase 1; design `95` §A; ARD 0013 D2). The profile is an **overlay over the inherited `projects` table by value** — it never owns project identity, name, or colour (read from `projects` by value per `94` §5.2).

## Public surface
The barrel `src/opzava/modules/projects/index.ts` is truth.

- **project-profile** (9): `PROJECT_PROFILE_SCHEMA_VERSION`, `PROJECT_TYPES`, `TILE_IDS`, `projectProfileSchema`, `parseProjectProfile`, `defaultTilesForType`, type `ProjectType`, type `TileId`, type `ProjectProfile`
- **project-profile-repository** (2): `createProjectProfileRepository`, type `ProjectProfileRepository`

Anything not exported by the barrel (the internal `DEFAULT_TILES` map, the prepared statements) is internal. The `.test.ts` files are internal.

## Dependencies
- **Outbound:** `better-sqlite3` (`Database` type) + `zod` only. **No `@/lib` import, no inherited-table SQL** — this is canonical Engine-B (`test/engine-boundary.test.mjs`, `src/opzava/architecture.test.ts`).
- **Inbound** (do not silently break): the composition reader `readProjectCard` (95 §A, platform/composition — Slice 2) and the thin routes `GET/PUT /api/projects/[id]/profile` (Slice 2). Cross-engine surfacing (merging inherited `projects`/`tasks`) lives in `platform/composition`, **not here** — this module is pure overlay storage.

## Invariants
1. **No `color` column / by-value project identity.** The profile stores only the overlay (`type`, `enabledTiles`, `cover`, `blurb`); name/colour/description are read from the inherited `projects` row by value at composition time. Never duplicate or write project identity here.
2. **Profile is an overlay — absence is not an error.** A project without a profile is valid; readers synthesize a default (`type='blank'`, `defaultTilesForType('blank')`). The overlay never blocks reads (enforced downstream in `readProjectCard`).
3. **ProjectProfile is frozen + strict.** `parseProjectProfile` (`project-profile.ts`) `Object.freeze`s the parsed record; the schema is `.strict()` — unknown keys (e.g. a stray `color`) are rejected. `type` and every `enabledTiles` entry are closed enums (`PROJECT_TYPES` / `TILE_IDS`).
4. **`defaultTilesForType` is pure and total.** Defined for every `ProjectType`; returns a frozen non-empty layout (the `95` §A open-Q1 proposal, adopted v1). Changing a type's default tiles is an operator/product decision — the function is the single source of truth.
5. **Repository upserts by `project_id` and is idempotent.** `INSERT … ON CONFLICT(project_id) DO UPDATE`; `ensureSchema` is `CREATE … IF NOT EXISTS` and safe to call across repository instances on the same db. `record_json` is the source of truth on read; the denormalized columns (`type`, `enabled_tiles`, `cover`, `blurb`, `updated_at`) exist for querying/indexing.

## Harmony rules
- **Which engine:** opzava canonical `src/opzava` (Engine B). The `opzava_project_profile` table is **separate from** the inherited `projects` table — it references project ids by value only, with no FK and no cross-engine import (ARD 0007, ARD 0013 D1/D2).
- **Tile vocabulary is a contract.** `TILE_IDS` is the authoritative v1 tile set (the union of the per-type defaults). Adding a tile means adding the surface that renders it; an enabled tile with no backing surface is dead UI. Keep `TILE_IDS`, `defaultTilesForType`, and the Essential workspace renderer in sync.
