# ADR-018: web→broker principal trust

Status: Proposed

> Decision brief for GitHub issue #194. This ADR is **Proposed**, not Accepted: it records the evidence and a recommendation so the owner can decide. The recommendation departs from all three options the issue lists, for reasons the evidence below makes plain. Nothing is implemented against it yet.

The `gateway-broker` authenticates the caller's service token and then reads the acting principal from the request body, shape-checking it and nothing more. This ADR proposes to **remove the four principal fields nothing reads** rather than verify them, and records that the current implementation deviates from ADR-003's already-accepted routing mandate.

## Context

### ADR-003 already decided this, and the code deviates

Issue #194 states that "ADR-003's two-token model does not cover it (it governs the OpenClaw-facing device/admin tokens, not web→broker)". That is not right, and it is the most important correction in this brief. ADR-003 (**Accepted**) addresses routing authority head-on:

> Routing is tenant-derived, not caller-supplied. The broker accepts an authenticated Opzava request context, resolves the tenant through Opzava membership/RBAC and the ADR-002 `GatewayInstance`, and then selects the route. It never trusts a `tenant_id`, Gateway endpoint, agent id, session key, or OpenClaw ref supplied by the browser or by an untrusted caller as proof of routing authority. The cross-tenant isolation invariant is: one broker connection maps to exactly one tenant Gateway, and every command/event handled on that connection is tagged and authorized as that tenant before it can update a projection, emit realtime fan-out, or return to a caller.
>
> — ADR-003, "Decision" (`docs/adr/ADR-003-gateway-broker-acl-two-token.md:46`)

The as-built broker does something different: it takes `tenantId` **from the caller's request body** and compares it against a `config.tenantId` pinned from `OPENCLAW_GATEWAY_TENANT_ID`. It does not resolve the tenant through membership/RBAC or a `GatewayInstance` lookup — it holds no database credential with which to do so (below).

The isolation *invariant* still holds today by construction: one broker instance is pinned to one tenant Gateway, so a caller-supplied tenant that disagrees is rejected rather than honoured. But the *mechanism* ADR-003 specifies — derive, never accept — is not what is implemented. So #194 is better read not as "an undocumented trust boundary" but as **an accepted decision that was implemented by a weaker mechanism**. That reframing matters: the question is not only "what should we build" but "do we amend ADR-003, or conform to it".

Note also that ADR-003's mechanism ("resolves the tenant through Opzava membership/RBAC and the ADR-002 `GatewayInstance`") is essentially #194's Option 1, and it presumes the broker can read Opzava data — which the as-built broker deliberately cannot. Whichever option is chosen, ADR-003 needs amending or conforming; it cannot be left as-is while the code does something else.

### What exists today

There is exactly one holder of `BROKER_INTERNAL_TOKEN` in product code and exactly one caller: `apps/web/app/api/tasks/ask-admin/turn/route.ts:79`, which passes it to `createBrokerOpenClawGatewayPort`. Every other occurrence is `.env.example`, `docker-compose.yml`, `turbo.json`, `apps/web/playwright.config.ts`, the bring-up runbook, and tests.

That caller derives the principal from a verified Better Auth session (ADR-006). It calls `getAppSessionContext(...)` and returns 401 when it is null before doing anything else (`route.ts:616-620`); `actingPrincipal(context)` (`route.ts:265-273`) then builds the block from `context.orgId`, `context.workspaceId`, `context.user.id`, and `context.roleKeys`, and `principalSessionId` comes from `context.sessionId`. So in the only path that exists, the block the broker shape-checks **is** session-derived.

#188 landed the interim honesty fix: the type and parser are now `AssertedPrincipalBlock` / `parseAssertedPrincipal` (`apps/gateway-broker/src/internal/http-server.ts:15,151`), and the parser carries a docstring stating that it only checks shape and that the token holder can assert any tenant principal. The code no longer claims a verification it does not perform.

### Three facts that change the analysis

**The broker is single-tenant per instance.** Its runtime config resolves exactly one `tenantId` from `OPENCLAW_GATEWAY_TENANT_ID` (`apps/gateway-broker/src/runtime/env.ts:94-100,148-156`), consistent with ADR-002's pure-per-tenant topology and the one-static-per-tenant Gateway invariant.

**Tenant binding is enforced, twice.** `connection-manager.ts:87` rejects `actingPrincipal.tenantId !== route.tenantId` at route acquisition, and `operator-client.ts:346` repeats it at the broker-internal boundary. Both fail with `gatewayBroker.tenantMismatch`. This guard is live, not theoretical: #199 is a report of it firing in production against a stale `OPENCLAW_GATEWAY_TENANT_ID`.

**Nothing reads the other four fields.** `OpenClawActingPrincipal` (`packages/ports/src/openclaw-gateway.ts:70-76`) carries `tenantId`, `orgId`, `workspaceId`, `userId`, and `roleKeys`. `toActingPrincipal` (`http-server.ts:238-248`) populates all five; `connection-manager.ts:101` forwards the whole block to `operator-client`. Only `tenantId` is ever read — by the two comparisons above. `orgId`, `workspaceId`, `userId`, and `roleKeys` are parsed, carried the length of the chain, and consumed by no one. They are not forwarded to OpenClaw either.

### What the exposure actually is

Issue #194 states the consequence as: "any holder of `BROKER_INTERNAL_TOKEN` can assert any tenant's principal and act as that tenant." **That is not accurate for the current topology.** A broker instance serves one tenant, and both tenant checks reject any `actingPrincipal` whose tenant is not that one. A token holder cannot act as another tenant through this broker; there is no other tenant behind it. `operator-client.ts:343-345` states the residual precisely:

> Route handles perform the primary check at acquisition. Repeating it at this broker-internal boundary catches an accidental bypass or refactor; it cannot stop an internal-token holder from asserting another principal.

The honest exposure is narrower and entirely latent. Forging `userId` or `roleKeys` buys nothing today because nothing reads them. It becomes real the moment either of two things happens:

1. **Any code starts trusting those fields** — per-user audit attribution, RBAC at the broker, or forwarding identity to OpenClaw as SOUL claims. At that instant the forgery is live, with no change at the boundary and nothing to fail a review. The fields are named as if verified, so the next reader has every reason to trust them.
2. **A fleet of brokers shares one token.** This is the trigger that matters, and it is a *planned* topology, not a hypothetical. ADR-002's dynamic per-tenant provisioning (deferred, not deleted — see the Q18 amendment) gives every tenant its own Gateway and its own broker. Each of those brokers is still single-tenant, so fact B and both tenant checks survive intact — **and provide no protection whatsoever**. `BROKER_INTERNAL_TOKEN` is a single global (`docker-compose.yml:60,170` feed the same value to `web` and `gateway-broker`), so a fleet would share one secret. An attacker holding it does not need to defeat any tenant check: they connect to *tenant B's own broker* and assert `tenantId: B`, which matches that broker's config and passes. Every tenant becomes reachable, one broker at a time.

   This corrects an earlier framing of this brief. The danger is not "the broker becomes multi-tenant" (one instance, many routes) — that is not the planned design. It is **many single-tenant brokers sharing one credential**, where per-instance tenant pinning is not a boundary at all. `tenantId` is checked against the instance the caller chose, so it constrains nothing about *which instance* they may choose.

This is design debt with a trigger, not a present hole — today there is exactly one broker (`opzava-gateway-broker-1`), so there is no fleet and no lateral movement. It matches the issue's own framing ("Not a live escalation today", "the shape invites a future caller"). But the second trigger fires on a roadmap item, not on a hypothetical, and that should set the urgency.

### The constraint that rules out one option

The broker holds **no database credential**, and the distinction from "no database access" matters. There is no `DATABASE_URL` in its runtime config (`env.ts:7-15`) and no postgres or drizzle import anywhere in `apps/gateway-broker/src`. But its dependency `@opzava/adapters` exports `createPostgresDatabase`, `createPostgresPool`, `db`, and `pool` (`packages/adapters/src/index.ts:1`) and carries `drizzle-orm` and `pg` (`packages/adapters/package.json:33-34`). So the Postgres client is already in the broker's dependency graph; what keeps it data-free is **operational discipline — one absent env var — not structure**.

That cuts against the brief's own recommendation and is worth stating plainly: the boundary protecting the broker from the data of record is thinner than it looks. It makes Option 1 cheap to implement (wire one env var) and correspondingly easy to reach for without an architectural decision, which is precisely why the decision should be recorded now rather than discovered later in a diff.

## Options

**Option 0 — remove the fields nothing reads (recommended).** Carry only `tenantId`, which is checked, plus `sessionId` for correlation, documented as correlation-only. Delete `orgId`, `workspaceId`, `userId`, and `roleKeys` from `AssertedPrincipalBlock` and `OpenClawActingPrincipal`.

Cost: small and mechanical — one port type, one parser, one mapper, one caller. No new infrastructure, no new dependency, no key management. It removes the trap outright: an unverifiable claim that is never transmitted cannot be forged, and a future reader cannot start trusting a field that is not there. It also makes the remaining contract true to its name — every field that survives is one the broker either actually verifies (`tenantId`) or explicitly disclaims (`sessionId`, see Consequences).

Option 0 defuses **trigger 1 only**, and that limit is the reason it is not sufficient alone. Trigger 1 becomes impossible by construction: adding a consumer now requires adding the field back, which forces the verification question to be answered at that moment, by whoever needs it, with a real use case in hand. **Trigger 2 is untouched by Option 0** — deleting unread identity fields does nothing about a shared token across a fleet, because that attack never needed to forge identity in the first place. Only Option 3 addresses it, which is why the recommendation is Option 0 **and** Option 3, not a choice between them.

The honest objection: this narrows the port. If a near-term consumer is already known, Option 0 is churn and Option 2 should be taken directly. That is the question the owner should answer.

**Option 2 — audience-bound signed principal assertion.** Web mints a short-lived signed assertion (JWT or equivalent), audience-bound to the broker; the broker verifies the signature and derives the principal from verified claims. This is the right answer **when a genuine consumer appears**, and it is the cheapest real verification here because it needs no new data dependency — only a verification key reaching the broker. Deferred, not rejected: adopting it now builds and operates key distribution and rotation to protect fields no code reads.

**Option 1 — broker resolves an opaque session credential against the session store.** Strongest in principle: the broker derives tenant/org/workspace/user itself and accepts no claims. **Recommend rejecting** unless the broker gains DB access for other reasons. It would make the broker a consumer of Opzava's identity store, giving a service whose whole job is protocol translation a live credential to the data of record — so a broker compromise, currently bounded to one tenant's Gateway traffic, would reach the session store. That is a worse trade than the debt it retires. A variant that calls back to web to resolve the session avoids the DB dependency but inverts the dependency direction (broker→web→broker) on the hot path.

**Option 3 — per-tenant scoped internal token.** **The only option that addresses trigger 2, and it is orthogonal to the others.** An earlier draft of this brief dismissed it as "structurally already true because the instance is per-tenant" — that was wrong, and the error is worth stating plainly because it is seductive: per-instance tenant pinning looks like tenant scoping, but it only binds *what a caller may assert once they have reached a given broker*. It says nothing about *which brokers they may reach*. With one shared secret across a fleet, the answer is "all of them", and the tenant check passes at each.

Scoping the token per tenant is what makes a stolen credential worth one tenant instead of all of them. It does not verify the principal at all, so it neither replaces nor is replaced by Options 0/1/2 — it is a separate, additive decision that should be made before the fleet exists rather than after. It is cheap while there is one broker and one token to rotate; it is a migration once there are many.

## Recommendation

Take **Option 0 + Option 3**. They are independent and address different halves; either alone leaves a real gap.

- **Option 0 now** (delete the four unread fields) retires the latent identity trap at near-zero cost, and finishes what #188's rename started: every field the broker accepts becomes one it either verifies or explicitly disclaims.
- **Option 3 before the fleet exists** (per-tenant scoped token) is the only thing that constrains a stolen credential once ADR-002's per-tenant provisioning lands. Doing it while there is one broker and one secret is a config change; doing it afterwards is a fleet-wide rotation.
- **Option 2 deferred** to the first real consumer of user identity, as the designated answer when one appears.
- **Option 1 rejected** on blast-radius grounds — unless ADR-003's "resolve through membership/RBAC" mechanism is to be honoured literally, in which case the DB-access question must be decided first, at ADR-001/ADR-003 level, not inside #194.

This inverts the issue's framing deliberately. #194 asks how to verify the principal; the evidence says four fifths of the principal should not be transmitted at all, and the one field that matters (`tenantId`) is cross-checked against config — by a guard that #199 proves fires in production. Verification machinery for data nobody reads is cost without a beneficiary, and it would leave the same trap in place: a future consumer would trust `roleKeys` because the type says it is verified, whichever option is chosen.

The owner must also settle **ADR-003**, which is not optional under any option: the accepted text mandates a derive-never-accept mechanism the code does not implement. Either amend ADR-003 to describe config-pinned single-tenant routing as the accepted mechanism, or keep it and treat the deviation as debt with its own ticket.

If a near-term consumer of user identity is already known, Option 0 is churn — take Option 2 directly and skip it. Option 3 stands either way.

## Sequencing

The sole caller is the Ask Admin turn path, whose v1 contract is PRD-005 and wayfinder map #210 — **paused** pending the parked #215. `CLAUDE.md` directs reading those before changing the admin chat, orchestrator, or broker `chat.*` paths.

Option 0 is a narrowing of a boundary that map does not own and is unlikely to conflict with it. Option 2 changes the web↔broker contract on exactly the path #210 is specifying and should wait for it to resume. This is also why #194 should not be picked up as an implementation ticket while it carries `needs-triage`: the decision here gates the work, not the other way round.

## Consequences

Under Option 0:

- `AssertedPrincipalBlock` and `OpenClawActingPrincipal` narrow to `tenantId` + `sessionId`. Every field the broker accepts is then one it verifies or has explicitly disclaimed, so the type stops overstating its guarantees — finishing what #188 started by renaming.
- **`sessionId` must be explicitly disclaimed, or Option 0 just moves the trap.** It survives for correlation only and is exactly as unverified as the fields being deleted; leaving it un-disclaimed invites the next reader to use it for audit attribution, rate limiting, or session revocation on the strength of a string the broker never checked. The parser already carries the right words — "Correlation only; the broker does not verify this value against a session" (`http-server.ts:16`) — and that comment must stay load-bearing, naming the forbidden uses. If that disclaimer feels too fragile to rely on, drop `sessionId` too and correlate on `turnId`, which is Opzava-generated and needs no trust.
- **Broker-level user attribution is given up.** Deleting `userId`/`orgId` means the broker can log and meter per *tenant* only; "user X in org Y made this request" is no longer answerable there. That is the correct split — the BFF holds the verified session and should own user-level observability and metrics — but it is a real trade, and any future broker-side per-user metric or rate limit is then a request for Option 2, not a small logging change.
- **The BFF's routing is load-bearing and should be stated as such.** The security model rests on a multi-tenant BFF selecting the correct single-tenant broker. The broker's tenant check is defence in depth against a misroute — valuable precisely because it caught a real one (#199) — but it is not the primary control. The primary control is BFF routing correctness.
- The web BFF remains implicitly trusted for the tenant it fronts. That trust is real and stays; this ADR makes it *narrow and stated* rather than broad and unstated. A compromised BFF already holds the database and the session store, so this is not the boundary that would contain it.
- #194 stays open until the owner picks. Its stated cross-tenant consequence should be corrected on the issue either way: it does not hold for the current single-broker topology, and under a fleet the real mechanism is the shared token (Option 3), not the unverified principal.

Under Option 3, additionally: `BROKER_INTERNAL_TOKEN` stops being one global secret. Provisioning must mint and rotate a per-tenant broker credential, and the reaper/lifecycle saga must revoke it with the instance — so this decision belongs in the ADR-002 provisioning path, and should be settled before that path is built rather than retrofitted onto a live fleet.
