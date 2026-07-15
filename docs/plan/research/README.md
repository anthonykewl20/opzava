# Research Memo Index

These research files are frozen planning evidence. They document official-doc checks and design reasoning consumed by later slices; accepted ADRs, PRDs, and `docs/plan/EXECUTION.md` control current implementation.

Important pin rule: `slice1-foundation-stack.md` has a raw version table that lists TypeScript `6.0.3`, but its final "Locked pins for the Slice 1 scaffold" section overrides that value to `5.9.x`. The locked pins section wins.

| File | Purpose | Status / consumed by |
| --- | --- | --- |
| `q6-auth-stack.md` | Auth-stack deep research comparing Better Auth, Auth.js/NextAuth, and Lucia for a Next.js/Postgres B2B SaaS. | Consumed by Q6 and ADR-006; retained as cited auth-stack evidence. |
| `q6-auth-stack.deepresearch.json` | Raw deep-research output behind `q6-auth-stack.md`. | Raw appendix only; read the Markdown memo first. |
| `slice1-foundation-stack.md` | Official-doc validation for Slice 1 foundation stack, pins, setup gotchas, and scaffold rules. | Consumed by Slice 1a and `docs/plan/official-docs.md`; final locked pins override raw table conflicts. |
| `slice1b-data-rls.md` | Data-layer, RLS, migration, PgBouncer, and `withTenant` design memo. | Consumed by Slice 1b implementation and RLS review. |
| `slice1c-auth.md` | Better Auth admin authentication, first-owner setup, session-to-tenant, and auth/RLS design memo. | Consumed by Slice 1c implementation and auth red-team review. |
| `wf211-ask-admin-memory-backend.md` | OpenClaw memory-backend evaluation for Ask Admin (builtin memory-core vs QMD vs memory-lancedb vs Honcho vs memory-wiki) against the wayfinder map #210 criteria; recommends builtin + per-agent `extraPaths` cross-agent read. | Consumed by wayfinder tickets #217 (memory-architecture grilling) and #220 (Ask Admin v1 spec). |
| `wf221-ask-admin-v1-skills.md` | OpenClaw skill mechanics + Ask Admin v1 skill-set evaluation; dual-model research (Claude + Codex gpt-5.6-sol scouts) with a Codex consensus review. Recommends 3 proprietary skills (opzava-card-authoring, opzava-pm, opzava-reporting); flags that current tool policy makes skills unusable and records the corrected profile recipe. | Consumed by wayfinder tickets #219 (skills grilling), #212 (tool inventory — hard dependency), and #220 (Ask Admin v1 spec). |
