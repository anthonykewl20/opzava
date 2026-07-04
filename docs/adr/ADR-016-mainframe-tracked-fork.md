# ADR-016: Own OpenClaw as a tracked fork (`mainframe/`)

Status: Accepted (Q18, 2026-07-04) — implementation lands in the mainframe-move slice (`docs/plan/EXECUTION.md`)

Opzava owns OpenClaw as a **tracked fork, not a hard fork**: the upstream working tree is squash-imported into
`mainframe/` at a pinned version, the Platform Gateway image is **built from that source** (`build: ./mainframe`)
instead of pulled from `ghcr.io/openclaw/openclaw`, and all customization follows a strict ladder that keeps the
upstream merge path alive.

## Context

Opzava previously consumed OpenClaw as an official upstream image pinned in `docker-compose.yml`. The user
directive (Q18) is to OWN the gateway: run our own build, be able to patch it, host it as the production gateway on
the Dokploy VPS, and heavily customize the platform over time — without losing OpenClaw's active upstream stream of
security fixes, provider updates, and channel fixes (OpenClaw executes commands and holds channel credentials; a
frozen fork becomes a known-vulnerable runtime). The upstream clone (github.com/openclaw/openclaw, v2026.6.11,
commit `bd2740fedc`, MIT) is a self-contained pnpm monorepo: ~269MB working tree plus 1.6GB of upstream git history.

## Decision

1. **Squash import.** Move the clone's WORKING TREE (no upstream `.git`) to `mainframe/`. Record the pin in
   `mainframe/UPSTREAM.md` (repo, tag, commit, import date). Upstream bumps are deliberate operations:
   scratch-clone upstream, diff old..new tag, apply, re-review patches. No GitHub fork repo until we upstream patches.
2. **Vocabulary.** *Mainframe* = the fork source we own. *Platform Gateway* = the running container
   (`openclaw-platform-gateway`), built from `mainframe/` with the same command/ports/named volumes as before —
   the image source swap is seamless because gateway state lives in volumes, never the image.
3. **Customization ladder** — every change lands on the LOWEST rung that can express it:
   - Rung 0: config (gateway config, env, flags).
   - Rung 1: official extension points (extensions/skills/hooks).
   - Rung 2: first-party additive modules in our namespace (`extensions/opzava-*`); upstream files untouched.
   - Rung 3: source patches to upstream files — each logged in `mainframe/PATCHES.md` (what/why/upstream status),
     re-reviewed at every bump. Expected near-empty. Opzava product features (marketing automation, CRM assistants)
     are NEVER fork customizations; they use the gateway via the broker (skills/cron/agents).
4. **Workspace isolation.** `mainframe/` is its own pnpm workspace and is EXCLUDED from the Opzava workspace;
   the ONLY integration point is the Docker image boundary.
5. **Build path.** Local and Dokploy both build from `./mainframe` (parity by construction). Pre-agreed fallback if
   VPS builds fail: CI builds the mainframe image to a private registry and BOTH environments pull it.
6. **Break-glass.** The fork's own Control UI stays enabled in the image, internal-only, never Traefik-routed;
   ops access is SSH tunnel + port-forward.

## Consequences

- We control build, deploy, patching, and upgrade cadence; version bumps become tested operations, not tag changes.
- Upstream security fixes remain mergeable because upstream files stay near-pristine (ladder + PATCHES.md).
- The Opzava admin dashboard replaces the fork's Control UI for operators; the fork's `ui/` needs no customization.
- Repo grows by the imported working tree once (no upstream history); `docs/openclaw/` curated docs remain the
  canonical reference for design work.

## Alternatives

- **Keep pulling the official image:** no source ownership, no patch path; rejected by user directive.
- **Hard fork:** full divergence orphans us from upstream security/provider fixes with a small team; rejected.
- **git subtree/submodule with history:** permanent 1.6GB history bloat or split-repo build complexity for no
  reproducibility gain over `UPSTREAM.md` + pinned tag; rejected.

## Related ADRs

- [ADR-002](ADR-002-tenancy-provisioning.md): per-tenant dynamic provisioning is deferred (amended by Q18); at
  multi-tenant, dynamic gateways use this same mainframe-built image.
- [ADR-003](ADR-003-gateway-broker-acl-two-token.md): unchanged; owning the source grants nobody a bypass of the
  broker ACL or two-token model.
- [ADR-015](ADR-015-deployment-parity.md): amended — the gateway is a static Compose service built from
  `./mainframe`; production home is the Dokploy VPS; one public WS surface.
