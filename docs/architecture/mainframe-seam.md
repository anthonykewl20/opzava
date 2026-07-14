# Mainframe seam (Opzava <-> Mainframe fork)

## Purpose

This document maps the seam between Opzava-owned code and Mainframe, the Opzava-owned tracked fork of OpenClaw at `mainframe/` (`docs/adr/ADR-016-mainframe-tracked-fork.md`).
The module inventories deliberately skip this seam because `mainframe/` is excluded from the Opzava pnpm workspace, so its only integration point is the Docker image boundary (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 4).
The two load-bearing invariants are "one ACL" and "lowest rung that works"; both are restated explicitly in the final section.

## Vocabulary (use exactly)

This section repeats the load-bearing CONTEXT.md terms so this document is self-contained; `CONTEXT.md` remains canonical.
OpenClaw is the upstream open-source agent runtime at github.com/openclaw/openclaw (`CONTEXT.md`).
Mainframe is the Opzava-owned tracked fork of OpenClaw at `mainframe/`, the source code we build and patch, and it is not the running container (`CONTEXT.md`).
The Platform Gateway is the one running OpenClaw gateway container, the `openclaw-platform-gateway` Compose service, built from `mainframe/` (`CONTEXT.md`; `docs/adr/ADR-016-mainframe-tracked-fork.md` decision 2).
The Customization ladder is the rungs 0-3 ordering for changing Mainframe, lowest rung that works, always (`CONTEXT.md`).
The gateway-broker, or broker, is the ONLY hot-path ACL to OpenClaw (`CONTEXT.md`; `docs/adr/ADR-003-gateway-broker-acl-two-token.md`).
The provisioning-worker, or worker, is the admin/JIT-token path for config, onboarding, pairing, and later dynamic Gateway lifecycle (`CONTEXT.md`; `docs/adr/ADR-002-tenancy-provisioning.md`).
The Two-token model splits the hot-path device token, `operator.write` + `operator.approvals`, from the short-lived job-scoped `operator.admin` (`CONTEXT.md`; `docs/adr/ADR-003-gateway-broker-acl-two-token.md`).
UPSTREAM.md is `mainframe/`'s pin record and PATCHES.md is its rung-3 patch ledger (`CONTEXT.md`; `mainframe/UPSTREAM.md`; `mainframe/PATCHES.md`).

This document also uses the codebase-design vocabulary precisely: Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality, the deletion test, "the interface is the test surface", and "one adapter = hypothetical seam, two adapters = real seam".

## Where the seam lives

The seam between Opzava-owned code and Mainframe is the Docker image boundary, not a code-level import (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 4).
`mainframe/` is its own pnpm workspace and is excluded from the Opzava workspace, so no Opzava package imports Mainframe source, and the Platform Gateway image is built from that source with `build: ./mainframe` (`docs/adr/ADR-016-mainframe-tracked-fork.md` decisions 1 and 4; `ARCHITECTURE.md` deployment topology).
The Interface at this seam is therefore not a TypeScript signature.
It is the OpenClaw Gateway WS protocol surface, request/response frames, server-push events, scope negotiation, and policy limits, plus the Docker image contract of command, ports, and named volumes (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` context; `docs/adr/ADR-016-mainframe-tracked-fork.md` decision 2).
This is a deep Interface by construction: a large amount of OpenClaw behavior, including sessions, runs, streaming, channels, cron, skills, memory/wiki, logs, diagnostics, usage, and Workboard, sits behind a small protocol and one image boundary (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` context; `ARCHITECTURE.md` "What Opzava is").

Two Opzava-side Adapters satisfy interfaces that live at this seam.
The first is the `gateway-broker`, the adapter for `OpenClawGatewayPort`, which holds one WS-first operator client per active tenant Gateway, translates OpenClaw frames into Opzava-named commands, queries, events, DTOs, opaque Refs, and error types, and prevents OpenClaw DTOs and raw frames from leaking into bounded contexts (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` decision; `ARCHITECTURE.md` agnostic ports catalog).
The second is the provisioning-worker's rootless-Docker adapter for `GatewayRuntimePort`, which provisions, starts, stops, health-checks, suspends, resumes, and deprovisions Gateway instances through the docker-socket-proxy (`docs/adr/ADR-002-tenancy-provisioning.md` decision; `ARCHITECTURE.md` system context and ports catalog).
Applying the heuristic "one adapter = hypothetical seam, two adapters = real seam", each port currently has a single production adapter: `OpenClawGatewayPort` has the broker, and `GatewayRuntimePort` has rootless Docker, with K8s and Nomad retained as later adapters behind the same port (`docs/adr/ADR-002-tenancy-provisioning.md` decision).
The seam is nonetheless real rather than hypothetical, because it is a wire protocol and an image contract rather than an in-process call, and because ADR-003 requires an anti-corruption layer that keeps OpenClaw DTOs, scope semantics, and protocol drift out of bounded contexts (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` decision and alternatives).

Leverage is high and Locality is strong at this seam.
A small WS protocol plus one Docker image gives Opzava all of OpenClaw's runtime without reimplementing it, which is the OpenClaw capability parity principle (`ARCHITECTURE.md` governing principles; `docs/adr/ADR-016-mainframe-tracked-fork.md` context).
Mainframe changes are Local to the fork: Opzava product features such as marketing automation and the deferred CRM rebuild are never fork customizations, and instead live in the Opzava app and use the gateway via the broker (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 3; `mainframe/PATCHES.md`). CRM returns with the user-side dashboard (GitHub issue #200).
The deletion test makes the depth visible: if `mainframe/` were deleted and the upstream image pulled again, the broker contract would survive because the Interface is the protocol and image contract, not the fork source.

## The customization ladder (rungs 0-3)

Every change to Mainframe lands on the LOWEST rung that can express it (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 3; `mainframe/PATCHES.md`).
The ladder keeps the upstream merge path alive so OpenClaw's security fixes, provider updates, and channel fixes stay mergeable, because a frozen fork becomes a known-vulnerable runtime given that OpenClaw executes commands and holds channel credentials (`docs/adr/ADR-016-mainframe-tracked-fork.md` context).

| Rung | What it is | When to use it |
| --- | --- | --- |
| 0 | Config: gateway config, env, flags. No source change. | Default first attempt for any behavioral change expressible in upstream config (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 3; `mainframe/PATCHES.md`). |
| 1 | Official upstream extension points: extensions, skills, hooks. | When upstream provides a first-class slot for the behavior and no source edit is needed (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 3). |
| 2 | First-party additive modules in our namespace, `extensions/opzava-*`, with upstream files untouched. | When the behavior is Opzava-specific and additive, and rung 1 has no slot for it (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 3; `mainframe/PATCHES.md`). |
| 3 | Source patches to UPSTREAM files, each logged in `mainframe/PATCHES.md` and re-reviewed at every bump. | Last resort, expected near-empty, and never for Opzava product features (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 3; `mainframe/PATCHES.md`). |

The decision rule is mechanical: start at rung 0 and climb only when the current rung provably cannot express the change.
The ledger's current contents prove the rule is honored in practice, because the only rung-3 entry patches `mainframe/Dockerfile` with an optional `OPZAVA_CLAUDE_CODE_VERSION` build arg whose default empty value keeps the image upstream-identical (`mainframe/PATCHES.md` entry 1; `mainframe/Dockerfile` line 333).

## How Opzava reaches OpenClaw: one ACL, one admin path

Opzava reaches OpenClaw capabilities through exactly two paths and no third path exists.
The hot path is the gateway-broker, the ONLY production path from any Opzava application to any OpenClaw Gateway, so browsers, Next.js route handlers, server actions, domain packages, and workers do not call OpenClaw directly (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` decision).
The broker applies Opzava authorization before any Gateway command is admitted, then routes by tenant-derived identity and never by a caller-supplied endpoint, `tenant_id`, agent id, session key, or OpenClaw Ref (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` routing decision; `ARCHITECTURE.md` cross-cutting invariants).
The hot-path credential is a per-Gateway paired device token requesting only `operator.write` + `operator.approvals`, and it must not include `operator.admin`, `operator.pairing`, or `operator.talk.secrets` (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` two-token decision).

The admin path is the provisioning-worker, which mints or fetches a separate short-lived JIT `operator.admin` credential scoped to one Gateway and one provisioning, repair, migration, incident-remediation, or teardown job (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` admin/provisioning decision; `docs/adr/ADR-002-tenancy-provisioning.md` default flow step 7).
That admin credential is used out of band from request handlers and the hot broker command path, is audited with actor, job, blast-radius, and idempotency metadata, and is revoked or allowed to expire when the job completes (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` admin/provisioning decision).
The worker drives the `GatewayRuntimePort` docker adapter through the docker-socket-proxy, the only Docker mutation surface, reachable only by `worker-provisioning` (`docs/adr/ADR-002-tenancy-provisioning.md` decision; `ARCHITECTURE.md` deployment topology).
Owning Mainframe source grants nobody a bypass of either path, because ADR-003 is explicitly unchanged by ADR-016 (`docs/adr/ADR-016-mainframe-tracked-fork.md` related ADRs; `docs/adr/ADR-003-gateway-broker-acl-two-token.md`).
The Admin HTTP RPC plugin may exist only as an ops fallback on loopback, tailnet, or private ingress, never as a product command path and never bypassing Opzava authorization, job audit, tenant routing, or the two-token split (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` Admin HTTP RPC decision).

In deep-module terms, "the interface is the test surface": tests assert against the broker's Opzava-named contracts and opaque Refs, not against raw OpenClaw WS frames or Gateway-local DTOs (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` ACL decision; `ARCHITECTURE.md` cross-cutting invariant "OpenClaw refs stay opaque").
Channel secrets, provider credentials, OAuth material, and Talk secrets stay inside each tenant Gateway and never enter Opzava Postgres, so Opzava stores only reachability metadata and vault references (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` split-credentials decision; `ARCHITECTURE.md` "Secrets do not duplicate").

## Patch ledger discipline (UPSTREAM.md / PATCHES.md)

`mainframe/UPSTREAM.md` is the pin record: upstream repo, tag, commit, import date, and license (`mainframe/UPSTREAM.md`).
The current pin is OpenClaw `v2026.6.11` at commit `bd2740fedc`, squash-imported on 2026-07-04 with the upstream `.git` dropped (`mainframe/UPSTREAM.md`; `docs/adr/ADR-016-mainframe-tracked-fork.md` context).
An upstream bump is a deliberate operation, never an image-tag change: scratch-clone upstream outside the repo, `git diff` old pin to new tag, review the diff against PATCHES.md so every rung-3 patch re-applies or is upstreamed or retired, apply the new working tree, update the pin, rebuild the image, and run the full real-world-validation gate plus broker and worker reconnect proof before committing (`mainframe/UPSTREAM.md` bump procedure; `docs/adr/ADR-016-mainframe-tracked-fork.md` decision 1).
No `pnpm install` output or build artifacts are committed, because the Docker build owns that (`mainframe/UPSTREAM.md` bump procedure).

`mainframe/PATCHES.md` is the rung-3 ledger: each row records the files touched, the what and why, and the upstream status, and each row is re-reviewed at every bump (`mainframe/PATCHES.md`; `docs/adr/ADR-016-mainframe-tracked-fork.md` decision 3).
The ledger is expected to stay near-empty, because Opzava product features are never rung-3 patches (`mainframe/PATCHES.md`; `docs/adr/ADR-016-mainframe-tracked-fork.md` decision 3).
The single logged patch today is the optional `OPZAVA_CLAUDE_CODE_VERSION` Dockerfile build arg, marked "Local only; candidate to upstream as a generic extra-globals build arg", which demonstrates the intended lifecycle of a rung-3 patch: land local, then upstream or retire (`mainframe/PATCHES.md` entry 1; `mainframe/Dockerfile` lines 333-335).

## Explicit invariants

**One ACL.** The gateway-broker is the ONLY hot-path ACL to OpenClaw; no Opzava code, BFF handler, domain package, or worker calls OpenClaw directly, and owning the source grants no bypass (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` decision; `docs/adr/ADR-016-mainframe-tracked-fork.md` related ADRs; `CONTEXT.md`).
**Two paths, two tokens.** Runtime work crosses the seam on the broker with `operator.write` + `operator.approvals`, while provisioning, repair, and teardown cross it on the worker with a short-lived job-scoped `operator.admin`, and the two credentials never meet (`docs/adr/ADR-003-gateway-broker-acl-two-token.md` two-token decision; `CONTEXT.md`).
**Lowest rung that works.** Every Mainframe change lands on the lowest rung, 0 through 3, that can express it; rung 3 is logged in PATCHES.md and re-reviewed at every bump; and Opzava product features never become rung-3 patches (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 3; `mainframe/PATCHES.md`).
**One integration point.** The Docker image boundary is the only integration point, `mainframe/` is excluded from the Opzava workspace, and Opzava reaches capabilities only through the broker and the provisioning worker (`docs/adr/ADR-016-mainframe-tracked-fork.md` decision 4).
**Upstream merge path survives.** UPSTREAM.md plus PATCHES.md keep upstream security and provider fixes mergeable, so a bump is a tested operation rather than a tag change (`mainframe/UPSTREAM.md`; `docs/adr/ADR-016-mainframe-tracked-fork.md` decision 1 and consequences).

## Related files

- `CONTEXT.md`, canonical glossary.
- `ARCHITECTURE.md`, system context, bounded-context map, agnostic ports catalog, and cross-cutting invariants.
- `docs/adr/ADR-016-mainframe-tracked-fork.md`, the tracked-fork decision and customization ladder.
- `docs/adr/ADR-003-gateway-broker-acl-two-token.md`, the one-ACL and two-token decision.
- `docs/adr/ADR-002-tenancy-provisioning.md`, the provisioning-worker, GatewayRuntimePort, and docker-socket-proxy decision.
- `mainframe/UPSTREAM.md`, the upstream pin and bump procedure.
- `mainframe/PATCHES.md`, the rung-3 patch ledger.
- `mainframe/Dockerfile`, the image build, including the single rung-3 patch at line 333.
