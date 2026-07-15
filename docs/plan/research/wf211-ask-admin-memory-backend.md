# Memory backend for `ask-admin-opzava` — research memo

Date: 2026-07-15
Origin: wayfinder map #210, ticket #211 (research); feeds the #217 memory-architecture grilling.

## The question

Which OpenClaw memory backend should the ADMIN-only "Ask Admin Opzava" Lead Orchestrator agent
(`ask-admin-opzava`, per-tenant Gateway container built from `mainframe/`) use for its own brain —
"memory wiki", "memory lancedb", or another option from OpenClaw's official menu? The platform will
later add per-project agents whose memory stores Ask Admin must be able to READ/SEARCH.

Criteria, in priority order:

1. **Cross-agent read (DISQUALIFIER)** — can Ask Admin search/read other agents' memory stores?
2. **Lean VPS ops** — no new heavyweight service; docker-compose ↔ Dokploy parity; embedded/file-based preferred.
3. **Auditability/repairability** — admin can inspect and fix what the agent remembers; human-readable wins ties.
4. **Precise recall of operator facts** (decisions, tickets, platform state) over fuzzy semantic similarity.
5. **Maturity in OpenClaw** — stable, documented, non-experimental.

## What the options actually are

The "official menu" is smaller than the page count suggests. Only **three things can own the active
memory slot / backend**: the builtin `memory-core` engine (default), the QMD backend, and slot-replacing
memory plugins (`memory-lancedb`, Honcho). Everything else on the memory pages is a **layer beside**
the backend, not a backend.

### 1. Builtin engine (`memory-core`) — the default backend

- **What it is:** the bundled default. Memory *content* is plain Markdown in the agent workspace
  (`MEMORY.md` + `memory/YYYY-MM-DD.md`); the search index is a per-agent SQLite database with FTS5
  BM25 keyword search, optional vector search via any embedding provider, and hybrid merge
  (`docs/openclaw/concepts/memory.md` lines 9–51, 109–117; `docs/openclaw/concepts/memory-builtin.md` lines 9–19).
- **Index location:** `agents/<agentId>/agent/openclaw-agent.sqlite` — a rebuildable cache
  (`openclaw memory index --force`) over the Markdown files
  (`docs/openclaw/concepts/memory-builtin.md` lines 87–94; `docs/openclaw/reference/memory-config.md` lines 521–524).
- **Cross-agent read:** YES — `memorySearch.extraPaths` indexes additional directories/files
  ("Directories are scanned recursively for `.md` files"; absolute paths allowed), and the setting is
  valid as a **per-agent override** (`agents.list[].memorySearch`), so only Ask Admin gets the extra
  corpus (`docs/openclaw/concepts/memory-builtin.md` lines 96–100;
  `docs/openclaw/reference/memory-config.md` lines 361–381, 455–457; confirmed unchanged in current
  docs at https://docs.openclaw.ai/reference/memory-config).
- **Works with zero external dependencies:** without an embedding provider only keyword search runs;
  `provider: "none"` is the documented deliberate FTS-only mode
  (`docs/openclaw/concepts/memory-builtin.md` line 40; `docs/openclaw/concepts/memory-search.md` lines 80–89).
- **Fork source:** bundled at `mainframe/extensions/memory-core/`; inventory says "included in OpenClaw"
  (`mainframe/docs/plugins/plugin-inventory.md` line 108).

### 2. `memory-wiki` — a companion plugin, NOT a backend (candidate A is a category error)

- **What it is:** a **bundled companion plugin** that compiles durable memory into a provenance-rich
  wiki vault (claims, evidence, dashboards, `wiki_search`/`wiki_get`/`wiki_apply`/`wiki_lint`). The docs
  are explicit: "It does **not** replace the active memory plugin. The active memory plugin still owns
  recall, promotion, indexing, and dreaming" (`docs/openclaw/plugins/memory-wiki.md` lines 10–19;
  `docs/openclaw/concepts/memory.md` lines 119–137).
- So "use memory wiki as the backend" is not an option OpenClaw offers: an active memory plugin
  (memory-core/QMD/LanceDB/Honcho) must still own the memory slot; the wiki sits beside it.
- **Vault modes:** `isolated` (own vault), `bridge` (reads the active memory plugin's *public* artifacts
  through SDK seams), `unsafe-local` ("intentionally experimental and non-portable")
  (`docs/openclaw/plugins/memory-wiki.md` lines 76–107). Config under
  `plugins.entries.memory-wiki.config`, default vault `~/.openclaw/wiki/main` (lines 398–462).
- **Cross-agent read:** bridge mode reads only the *active memory plugin's* exported artifacts — i.e.
  the same gateway's memory plugin context, not an arbitrary other agent's workspace. Current docs add
  agent-scoped vaults where "agent-scoped imports accept a public memory artifact only when its
  `agentIds` includes the selected agent" (https://docs.openclaw.ai/plugins/memory-wiki — see drift
  notes). It is a knowledge-compilation layer, not a cross-agent recall mechanism.
- **Fork source:** bundled at `mainframe/extensions/memory-wiki/`; "included in OpenClaw"
  (`mainframe/docs/plugins/plugin-inventory.md` line 110).

### 3. `memory-lancedb` — official EXTERNAL plugin that replaces the memory slot (candidate B)

- **What it is:** "an official external memory plugin that stores long-term memory in LanceDB and uses
  embeddings for recall" — installed from npm (`openclaw plugins install @openclaw/memory-lancedb`),
  activated via `plugins.slots.memory = "memory-lancedb"`, replacing `memory-core`'s
  `memory_search`/`memory_get` with `memory_recall`/`memory_store`/`memory_forget`
  (`docs/openclaw/plugins/memory-lancedb.md` lines 11–35, 254–258).
- **NOT bundled into the runtime image**: "The plugin is published to npm and is not bundled into the
  OpenClaw runtime image" (`docs/openclaw/plugins/memory-lancedb.md` lines 27–28). Confirmed in the fork:
  `mainframe/package.json` line 116 excludes `!dist/extensions/memory-lancedb/**` from published files,
  and the official external catalog lists it as npm-install, `minHostVersion >=2026.5.31`
  (`mainframe/scripts/lib/official-external-plugin-catalog.json` lines 319–332;
  `mainframe/docs/plugins/plugin-inventory.md` line 254: "npm; ClawHub").
- **Storage:** one LanceDB database, default `~/.openclaw/memory/lancedb` (`dbPath` overridable,
  S3-compatible `storageOptions` supported) (`docs/openclaw/plugins/memory-lancedb.md` lines 260–309).
- **No per-agent scoping in the store.** Fork source: a single table `const TABLE_NAME = "memories"`
  with schema `{id, text, vector, importance, category, createdAt}` — **no agent column**
  (`mainframe/extensions/memory-lancedb/index.ts` lines 180, 52–58, 245–252). All agents on the gateway
  share one undifferentiated memory pool with cross-agent WRITE as well as read.
- **Hard runtime dependencies:** native `@lancedb/lancedb` package (platform caveats: no darwin-x64
  build), and a working embedding endpoint — OpenAI API key, GitHub Copilot, Ollama, or another
  OpenAI-compatible server (`docs/openclaw/plugins/memory-lancedb.md` lines 74–170, 311–324).
- **Recall is vector-similarity only** (`table.vectorSearch(vector)` in
  `mainframe/extensions/memory-lancedb/index.ts` lines 272–280); no BM25/keyword path.

### 4. QMD backend (`memory.backend = "qmd"`)

- **What it is:** a config-flag backend that delegates search to [QMD](https://github.com/tobi/qmd), a
  local-first sidecar **binary** (installed via `npm install -g @tobilu/qmd`, must be on the gateway's
  PATH) combining BM25, vectors, and reranking. Falls back to the builtin engine if unavailable
  (`docs/openclaw/concepts/memory-qmd.md` lines 9–49).
- **Cross-agent read:** YES — `memory.qmd.paths` indexes arbitrary extra directories, and
  `agents.list[].memorySearch.qmd.extraCollections` is explicitly documented "for agent-scoped
  cross-agent transcript search" (`docs/openclaw/concepts/memory-qmd.md` lines 137–155;
  `docs/openclaw/reference/memory-config.md` line 381).
- **Ops weight:** extra binary in the container image, SQLite build allowing extensions, and — for
  semantic/rerank modes — ~2 GB of GGUF models auto-downloaded on first query
  (`docs/openclaw/concepts/memory-qmd.md` lines 25–30, 87–90). BM25-only `searchMode: "search"` avoids
  the model downloads (lines 71–74, 261–264). Notable compatibility churn documented (per-version
  collection-filter behavior, traversal caveats, retry/backoff logic — lines 92–128, 277–281).

### 5. Honcho (`@honcho-ai/openclaw-honcho`)

- **What it is:** third-party plugin persisting conversations to a **dedicated Honcho service** —
  managed SaaS at `api.honcho.dev` or a self-hosted server (e.g. `http://localhost:8000`) — with user
  modeling and multi-agent parent/child awareness (`docs/openclaw/concepts/memory-honcho.md` lines 9–27,
  58–86).
- Cross-session/multi-agent memory is its selling point, but it is by construction a **standalone
  service** (or a SaaS dependency shipping tenant chat data off-box).

### 6. Not backends at all (for completeness)

- **`active-memory`** — a bundled plugin-owned *blocking recall sub-agent* that runs before replies and
  injects relevant memory; it rides on whatever memory plugin is configured (`memory_search`/`memory_get`
  for memory-core, `memory_recall` for lancedb) (`docs/openclaw/concepts/active-memory.md` lines 10–20,
  469–492; fork: `mainframe/extensions/active-memory/`). Orthogonal add-on, usable with any choice below.
- **`memory-search`** — the search pipeline/config of the builtin engine, not an option
  (`docs/openclaw/concepts/memory-search.md`).

## Comparison matrix

| Option | 1. Cross-agent read | 2. Lean VPS ops | 3. Auditability | 4. Precise recall | 5. Maturity |
|---|---|---|---|---|---|
| **Builtin `memory-core`** | **YES** — per-agent `memorySearch.extraPaths` over other agents' workspace `.md` files | **Best** — bundled, zero extra deps; SQLite index is a rebuildable cache | **Best** — memory IS Markdown files; admin edits them; reindex on save | **Good** — FTS5 BM25 exact-term + optional hybrid vectors | **Best** — the default, fully documented |
| QMD backend | YES — `qmd.paths` / per-agent `qmd.extraCollections` (explicitly cross-agent) | Medium — sidecar binary + SQLite-with-extensions in image; ~2 GB GGUF for rerank modes | Good — same Markdown source files | **Best** — BM25 + vectors + reranking | Medium — documented but heavy compat caveats; session indexing experimental |
| `memory-lancedb` | Degenerate — one global unscoped `memories` table: every agent reads AND writes one pool, no provenance | Poor — npm install into image, native lib, REQUIRES embedding endpoint (API key or an Ollama service) | Poor — opaque vector DB; only `openclaw ltm query` inspection; no file-level repair | Poor — vector-similarity only, no keyword path | Medium — official but external, platform caveats |
| Honcho | Yes (multi-agent aware) | **Fail** — dedicated standalone service or third-party SaaS | Poor — memory lives inside the service's models | Medium — semantic over observations | Medium — third-party plugin |
| `memory-wiki` | N/A as backend — bridge reads only the active memory plugin's public artifacts | Good (bundled) | **Best-in-class** (claims, provenance, dashboards) | Good (claim-level lookup) | Newer surface; `unsafe-local` experimental; still evolving (see drift) |
| `active-memory` | N/A — not a backend | Good (bundled) | N/A | N/A | Stable, documented |

## Disqualifications

- **`memory-wiki` as "the backend": disqualified on category.** It cannot own the memory slot — "It does
  not replace the active memory plugin" (`docs/openclaw/plugins/memory-wiki.md` lines 13–16). It is a
  candidate *companion layer*, not an answer to the backend question. As a cross-agent mechanism it also
  fails criterion 1: bridge mode reads the active memory plugin's exported artifacts, not other agents'
  stores.
- **Honcho: disqualified on criterion 2.** It requires a dedicated Honcho service (self-hosted server or
  SaaS) — exactly the "heavyweight standalone service" the ops constraint forbids, and the SaaS path
  ships tenant conversation data off-box (`docs/openclaw/concepts/memory-honcho.md` lines 58–86).
- **`memory-lancedb`: rejected on criteria 2–4 (and its criterion-1 story is a liability, not a feature).**
  It technically lets Ask Admin see other agents' memories only because the fork's plugin keeps ONE
  global, agent-unscoped table (`mainframe/extensions/memory-lancedb/index.ts` line 180 + schema lines
  52–58) — meaning per-project agents would also read and pollute the admin agent's memory with no
  isolation or provenance. It adds an npm-installed native plugin to the image (not bundled —
  `mainframe/package.json` line 116), hard-requires an embedding endpoint (OpenAI key or a new Ollama
  service), stores opaque vectors an admin cannot meaningfully repair, and recalls by vector similarity
  only — the opposite of criterion 4.
- **QMD: not disqualified, but not first.** It passes criterion 1 explicitly and wins criterion 4 raw
  quality, at the cost of a sidecar binary + model downloads + documented compatibility churn on a lean
  VPS where the builtin's hybrid search is already sufficient.

## RECOMMENDATION

**Use the builtin `memory-core` backend (the default) — no slot change, no new plugin — with a per-agent
`memorySearch.extraPaths` override on `ask-admin-opzava` pointing at the other agents' workspace memory
files.** Optionally layer `memory-wiki` (bundled) and/or `active-memory` (bundled) on top later; both are
additive and reversible.

**Runner-up: QMD backend** — adopt only if recall quality over a large multi-agent corpus proves
insufficient; it upgrades to reranking + explicitly-supported cross-agent collections
(`agents.list[].memorySearch.qmd.extraCollections`) at the cost of a sidecar binary in the image.

Why it wins, per criterion:

1. **Cross-agent read: PASS.** Other agents' memory is plain Markdown under
   `/home/node/.openclaw/workspace/<agent-id>/{MEMORY.md,memory/}`. `extraPaths` indexes exactly that,
   per-agent, read-only (indexing never writes source files) — Ask Admin searches everyone; project
   agents see only their own. This is the only option giving *asymmetric* cross-agent read.
2. **Lean ops: PASS.** Already in the `mainframe/` image; zero config today (the provisioner in
   `apps/workers/src/provisioning/` sets no memory config, so this is the current baseline); works
   docker-compose and Dokploy identically.
3. **Auditability: PASS.** The memory itself is human-readable Markdown the admin can open, edit, and
   git-diff inside the container/volume; the SQLite index is a rebuildable cache — which matches
   Opzava's own "projections are rebuildable caches" invariant.
4. **Precise recall: PASS.** FTS5/BM25 keyword search nails ticket IDs, config keys, and exact decisions
   even with `provider: "none"`; hybrid embeddings can be added later with one config key.
5. **Maturity: PASS.** It is the documented default backend.

### Concrete config shape

No `memory.backend` key (builtin is the default) and no `plugins.slots.memory` change (`memory-core` is
the default active memory plugin — `docs/openclaw/concepts/memory.md` line 117). The only delta is the
per-agent override, applied through the existing gateway-config mutation path
(`apps/workers/src/provisioning/gateway-config-mutation.ts`) whenever a project agent is provisioned or
removed:

```json5
{
  agents: {
    list: [
      {
        id: "ask-admin-opzava",
        memorySearch: {
          // Start deliberate FTS-only (no embedding credential on the hot path);
          // flip to an embedding provider later if fuzzy recall is wanted.
          provider: "none",
          extraPaths: [
            "/home/node/.openclaw/workspace/<project-agent-id>/MEMORY.md",
            "/home/node/.openclaw/workspace/<project-agent-id>/memory"
          ]
        }
      }
    ]
  }
}
```

Where things live on the gateway:

- Ask Admin's own memory (writable): `/home/node/.openclaw/workspace/ask-admin-opzava/MEMORY.md` and
  `/home/node/.openclaw/workspace/ask-admin-opzava/memory/YYYY-MM-DD.md`.
- Ask Admin's index (rebuildable cache):
  `/home/node/.openclaw/agents/ask-admin-opzava/agent/openclaw-agent.sqlite`
  (`docs/openclaw/reference/memory-config.md` lines 521–524).
- Other agents' memory (indexed read-only via `extraPaths`): their workspace `MEMORY.md` + `memory/`.
- Tools Ask Admin gets: `memory_search` + `memory_get` from `memory-core`
  (`docs/openclaw/concepts/memory.md` lines 109–117).
- Ops verbs: `openclaw memory status | search | index --force` (`docs/openclaw/concepts/memory.md`
  lines 272–278).

## Vendored-vs-current docs drift

1. **"Bundled" vs "external" for `memory-lancedb` — the vendored docs contradict themselves.** The
   vendored overview card calls it "Bundled LanceDB-backed memory" (`docs/openclaw/concepts/memory.md`
   lines 171–174) and `docs/openclaw/concepts/active-memory.md` line 516 says "the bundled
   `memory-lancedb` plugin", while the vendored plugin page (`docs/openclaw/plugins/memory-lancedb.md`
   lines 27–28), the fork inventory (`mainframe/docs/plugins/plugin-inventory.md` line 254), the external
   catalog, and the CURRENT docs (https://docs.openclaw.ai/plugins/memory-lancedb: "external plugin, not
   bundled") all say npm-external. Treat it as external: it must be baked into the container image.
2. **`memory-wiki` grew agent-scoping since vendoring.** Current docs
   (https://docs.openclaw.ai/plugins/memory-wiki) document a `vault.scope` config key and agent-scoped
   vaults where "agent-scoped imports accept a public memory artifact only when its `agentIds` includes
   the selected agent", plus the warning that this is "a same-process knowledge boundary, not an
   operating-system security boundary". None of this exists in the vendored
   `docs/openclaw/plugins/memory-wiki.md`. Directly relevant to any later multi-agent wiki layer —
   re-vendor before designing on it.
3. **Current `concepts/memory` mentions memory import from Codex and Claude Code** — absent from the
   vendored copy (minor; https://docs.openclaw.ai/concepts/memory).
4. **No drift found** on the load-bearing facts: builtin remains the default backend, `extraPaths`
   semantics unchanged (per-agent override, recursive `.md` scan), builtin index path unchanged, and
   `tools.sessions.visibility` `tree`/`agent`/`all` unchanged
   (https://docs.openclaw.ai/reference/memory-config).

## Open questions for the #217 memory-architecture grilling

1. **`memory_get` reach:** confirm on a live gateway that `memory_get` can read files surfaced from
   `extraPaths` hits (docs prove they are *indexed and searchable*; the builtin page does not spell out
   the `memory_get` path policy for outside-workspace files the way the QMD page does with its
   `qmd/<collection>/` prefix).
2. **Provisioning choreography:** which component appends/removes Ask Admin's `extraPaths` entries when
   project agents are created/deprovisioned (candidate: the same saga that owns
   `gateway-config-mutation.ts`), and how orphaned paths are reaped to honor the no-orphan invariant.
3. **Poisoned-memory blast radius:** indexing project agents' memory files makes a compromised project
   agent's notes retrievable context for the ADMIN agent. `memory-lancedb` wraps recalls in explicit
   "untrusted historical data" framing (`mainframe/extensions/memory-lancedb/index.ts` line 1320); verify
   what framing `memory_search` snippets carry in `memory-core`, and whether Ask Admin's system prompt
   needs an equivalent guardrail.
4. **Embeddings decision:** stay `provider: "none"` (zero credentials, exact-match only) or enable hybrid
   search — which provider, whose API key, and how that key fits the tenant secrets/two-token policy.
5. **Scale check:** index size and reindex latency for Ask Admin's SQLite index once N project agents'
   daily notes are all in `extraPaths` on the lean VPS (debounced 1.5 s reindex per
   `docs/openclaw/concepts/memory-builtin.md` line 91).
6. **Session-transcript recall:** whether Ask Admin should also search other agents' *conversations*
   (not just memory files) — that path is experimental and needs `tools.sessions.visibility: "all"`
   (`docs/openclaw/reference/memory-config.md` lines 448–453); default answer should be no until grilled.
7. **Later layers:** whether to enable bundled `active-memory` (auto-recall before replies) for the Ask
   Admin chat UX, and whether `memory-wiki` (isolated mode first) earns its keep for provenance-rich
   platform knowledge — decide only after re-vendoring the current wiki docs (drift item 2).
