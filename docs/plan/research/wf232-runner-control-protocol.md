# WF-232 — enrolled Runner and coordination trust protocol

Status: **Prepared resolution candidate for Wayfinder #232; pending reviewed landing, tracker
comment/closure, and parent-map pointer. Product code is not implemented.**

Date: 2026-07-17

Consumer: Wayfinder map #228 and final synthesis #237.

## Decision summary

1. A **Runner** is an explicitly admitted execution endpoint, not a person, agent, model, MCP
   client, OpenClaw Node, OpenClaw Device, or tool login. Local and cloud Runners use the same
   protocol but different enrollment identities and capability policies.
2. The local Runner makes one outbound WSS connection through the existing Traefik/broker public
   ingress. It opens no inbound port. Browser and Runner traffic use separate paths, roles,
   credentials, rate limits, and message schemas on that one public listener.
3. Enrollment proves possession of a locally generated key and compatibility with an approved Runner
   daemon/Adapter policy. V1 does **not** claim hardware-backed host integrity. A signed self-report
   that cannot be independently matched to approved software is not execution-eligible.
4. Runner control is several deep Modules. **Execution Admission** retains every DevTicket, claim,
   assignment, capacity, lease, fence, lane, and release decision fixed by WF-230. **Runner
   Registry** owns enrollment and capability policy. **Runner Protocol** owns authenticated frames,
   durable delivery/inbox facts, receipt verification, liveness, and reconciliation observations.
   **Harness Supervisor** owns local process/worktree containment behind Codex/Claude Adapters.
   **Lease Secret Broker** owns grant delivery and cleanup. No one Module becomes a second workflow
   engine.
5. `RunnerControlPort` accepts only typed, already-authorized orders and returns or publishes only
   authenticated facts. It never accepts a shell string, grants an Execution Lease, selects an
   assignee, changes a lane, approves work, or releases capacity.
6. Commands are written to a Postgres outbox before delivery and replayed at least once. A transport
   acknowledgement proves only receipt of bytes. Workflow facts require a separately signed typed
   Runner Receipt admitted through the WF-230 inbox/command path.
7. V1 uses domain-separated RFC 8785 canonical JSON and Ed25519 signatures. An outer transport frame
   binds the current connection epoch/transcript; an embedded connection-independent Semantic Runner
   Fact binds enrollment/key epoch, delivery/command, lease/fence/nonce, durable sequence, exact
   contract/repository/worktree/process, and policy digests so it can replay unchanged after
   reconnect. Duplicate semantic bytes are idempotent; a sequence collision, gap, stale outer epoch,
   stale fence, downgrade, or revoked key fails closed.
8. Heartbeats prove liveness only. An OS-supervised monotonic Lease Enforcer outside both the Runner
   daemon and vendor harness is mandatory because database fencing cannot stop a process. Loss of
   renewal/control authority causes local checkpoint, secret/tunnel grant removal, and
   stop-or-quarantine. Missing proof remains `execution_unknown`.
9. Reconnect never resurrects an old lease. It uploads a **Reconciliation Observation**, contains
   old processes and grants, and then continuation uses a fresh WF-230 `ClaimAndStart`, lease,
   fence, nonce, and start receipt. A local disconnect never triggers cloud failover.
10. Every execution uses a Runner-owned per-attempt worktree generation and branch. Repository,
    common Git directory, real path, base SHA, worktree, branch, process group, descendants,
    containers, ports, grants, and checkpoints are verified or quarantined as one containment set.
11. Cards and commands carry named secret-reference and lease-grant handles, never values. Tool
    login credentials remain Runner-local. Values cannot enter frames, prompts, arguments, paths,
    receipts, checkpoints, logs, errors, Slack, Ask Admin, MCP, GitHub, evidence, commits, or any of
    the four ledgers.
12. Slack Personal Assistant, Ask Admin, and MCP authenticate command **request provenance** only.
    Slack free text is intent, not approval; Ask Admin retains PRD-005 session/tool authority and no
    `operator.admin`; an MCP link token is neither machine enrollment nor a Runner key.
13. Both local and admitted cloud Runners may advertise ordinary implementation and
    `autonomous_serial` Sprint implementation. Selection is explicit before admission and never
    migrates mid-lease. Cloud execution cannot satisfy local Review. #229 owns Reviewer, Review
    Docker/evidence, and preview authorization; #233 owns scheduling, reservations, pause, and
    preemption.
14. The implementation must pass a mandatory deterministic signed-vector, real WSS, real
    Postgres/RLS, real process/worktree, secret-canary, Slack HTTP, reconnect, and local/cloud
    conformance suite without invoking a model or spending tokens. A separately labeled optional
    vendor-compatibility smoke may use a bounded live model, but it is never correctness evidence or
    a release gate for this protocol.

## Evidence and authority register

Every statement in this memo has one evidence class. The class prevents a current client feature
from silently becoming Opzava authority.

The supporting [vendor-evidence appendix](wf232-runner-vendor-evidence.md) preserves the broader
first-party research trace and explicit evidence gaps. It is evidence, not a second contract; this
prepared candidate and its staged canonical projections win if an inference in that appendix
differs. Neither is current input before the required landing/tracker/map sequence.

| Class                              | Meaning                                                                                                                                                                                        | Sources used here                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Locked Opzava target**           | Accepted product/architecture decision that this ticket consumes rather than reopens                                                                                                           | PRD-019; ADR-017; DBF-001–207; WF-230; migration manifest; parent map #228                                    |
| **WF-232 candidate decision**      | New Runner seam decision synthesized here; acceptance authority is the Human Owner's recorded planning approval plus the root orchestrator's future reviewed #232 landing/tracker/map sequence | This memo, DBF-238–249, and the canonical amendments linked from the migration manifest                       |
| **Current repository fact**        | Behavior present on `development` at `1db502d722ca33285148251a7660695868ad6a30`                                                                                                                | Exact paths in the as-built inventory below                                                                   |
| **Current vendor fact**            | First-party documented or locally probed behavior as of 2026-07-17                                                                                                                             | Official links and installed-client probes below                                                              |
| **Conditional Adapter capability** | Behavior Opzava may use only after a supported Adapter/version/mode probe proves it                                                                                                            | Tool capability matrix and effective-policy rules below                                                       |
| **Deferred unknown**               | Not sufficiently stable or evidenced for v1 authority                                                                                                                                          | Hardware integrity attestation; generic desktop UI automation; multi-repository execution; automatic failover |

### Locked inputs

- [PRD-019](../../prd/PRD-019-dev-board.md) owns observable Dev Board behavior.
- [ADR-017](../../adr/ADR-017-dev-board-authority-sync-execution.md) owns the authority split.
- [Dev Board foundation decisions](../dev-board-foundation-decisions.md) hold the locked detail,
  particularly DBF-103–120 and DBF-191–207.
- [WF-230](wf230-devticket-command-model.md) owns DevTicket commands, Claim Attempt phases,
  Execution Leases, start arbitration, containment, Blocked, and fresh recovery.
- [Migration manifest](../dev-board-migration-manifest.md) classifies current MCP/runtime artifacts
  as migration evidence rather than Runner credentials or receipts.
- PRD-005 owns Ask Admin conversations; PRD-013 owns Admin setup placement. Neither owns DevTicket
  execution authority.

### Current vendor evidence

- The local probe on 2026-07-17 reported `codex-cli 0.144.5`. `codex exec` supports an explicit
  working directory, `read-only`/`workspace-write`/`danger-full-access` sandboxes, approval policy,
  JSONL output, response schemas, persisted or ephemeral sessions, and resume. `app-server` and
  `remote-control` are labeled experimental by that installed first-party CLI. See the
  [Codex CLI reference](https://developers.openai.com/codex/cli/reference) and
  [Codex security guidance](https://developers.openai.com/codex/security/).
- The local probe reported Claude Code `2.1.211`. Its first-party CLI exposes print/headless mode,
  JSON/stream-JSON I/O, session IDs/resume, worktree creation, allowed/disallowed tools, settings,
  MCP configuration, and permission modes. Its own help warns that permission bypass belongs only in
  a safely isolated environment. See Anthropic's
  [CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage),
  [permissions](https://code.claude.com/docs/en/permissions),
  [security guidance](https://code.claude.com/docs/en/security), and
  [sandboxing guidance](https://code.claude.com/docs/en/sandboxing).
- Slack requires request-signature verification rather than deprecated verification tokens; an
  interactive request must be acknowledged promptly and longer work can continue asynchronously. See
  [Verifying requests from Slack](https://docs.slack.dev/authentication/verifying-requests-from-slack/)
  and [Interactive components](https://docs.slack.dev/interactivity/handling-user-interaction/).
- Git worktrees share one repository and require explicit lifecycle/locking discipline; see
  [`git worktree`](https://git-scm.com/docs/git-worktree).
- The wire choice uses
  [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785),
  [RFC 8032 Ed25519](https://www.rfc-editor.org/rfc/rfc8032), and
  [RFC 6455 WebSocket](https://www.rfc-editor.org/rfc/rfc6455).
- Vendored OpenClaw documentation for CLI backends and ACP proves that OpenClaw may launch or bridge
  coding harnesses. It does not grant Opzava Runner enrollment, DevTicket authority, or trusted
  receipts. See `docs/openclaw/gateway/cli-backends.md` and `docs/openclaw/cli/acp.md`.

These sources must be revalidated and version-pinned by the implementation ticket. This memo does
not promise that every vendor client/version combination is supported merely because a flag exists.

## As-built inventory and gaps

The target Runner protocol does not exist today.

| Current path                                                         | Current repository fact                                                                                                                                                                                            | Required disposition                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/runtime-control/src/application/tool-execution-harness.ts` | Deduplicates assistant tool outcomes and stores sanitized request/result summaries. It is not a process supervisor, signed Runner inbox, or lease boundary; its generic string sanitizer is not a secret detector. | Reuse outcome/idempotency patterns only. Never promote tool outcomes to Runner Receipts.                                                            |
| `packages/runtime-control/src/application/task-tools.ts`             | Ask Admin tools call legacy Task application functions and can request direct status changes.                                                                                                                      | Replace at Dev Board cutover with the single WF-230 command seam; do not add Runner policy here.                                                    |
| `apps/mcp-server/src/server.ts` and `tools.ts`                       | A `claude-code`-fixed link-token principal exposes legacy Task tools over MCP. The client label `viaClient: "claude-code"` is presentation metadata.                                                               | Preserve historical audit and migrate command ingress. A link token remains actor/request provenance, never machine proof.                          |
| `packages/identity-access/src/application/link-tokens.ts`            | Link tokens bind current user/session/membership, tenant/workspace, scopes, expiry, and revocation.                                                                                                                | Useful command-auth pattern; explicitly separate from Runner Enrollment, key epoch, process, lease, and receipt authority.                          |
| `apps/workers/src/link-tokens/issue-mcp-link-token.ts`               | Prints a shown-once token/config recipe for a local stdio MCP process.                                                                                                                                             | Retire unsafe manual-token assumptions at cutover; never copy this token into Runner frames or enrollment.                                          |
| `apps/web/app/api/tasks/ask-admin/turn/route.ts`                     | The BFF derives acting principal from the authenticated web session, stores turn/tool idempotency, and executes legacy Task tools.                                                                                 | Keep BFF session as actor provenance. Ask Admin may request Dev Board commands but cannot become the Runner or approval owner.                      |
| `apps/workers/src/provisioning/ask-admin-agent.ts`                   | Ask Admin's OpenClaw agent denies runtime/filesystem/write/admin/secret tools and uses narrow task tools.                                                                                                          | Preserve deny-wins and broker/worker token split. Add no Runner or secret authority by implication.                                                 |
| `apps/gateway-broker/src/internal/http-server.ts`                    | Internal HTTP/SSE accepts principal fields asserted by the holder of one internal bearer token; the broker shape-checks rather than re-verifies the user session.                                                  | The Runner route uses its own enrollment/key authentication. It never reuses this bearer token or body-asserted principal model.                    |
| `apps/gateway-broker/src/routing/connection-manager.ts`              | Manages OpenClaw operator WS clients, retries, and circuit state.                                                                                                                                                  | Reuse transport-operability lessons, not OpenClaw Device identity or operator scopes. Runner transport is a separate role/path and protocol Module. |
| `packages/ports/src/secrets-vault.ts`                                | A vault port can resolve a raw secret value server-side and has no lease/process/grant lifecycle.                                                                                                                  | Keep underlying secret authority separate. Add Lease Secret Broker and one-purpose grant semantics instead of exposing this port to a Runner.       |
| `packages/adapters/src/secrets/local-file-secrets-vault.ts`          | Local development values are stored in a JSON file and can be returned in full; this is not per-process isolation or upstream revocation.                                                                          | It may remain a development vault behind stronger grant handling, but it is not sufficient for Runner secrets and never supplies trust evidence.    |
| `apps/gateway-broker` and `RealtimeTransportPort`                    | There is no public enrolled-Runner channel, signed Runner frame parser, command delivery outbox, or reconciliation protocol.                                                                                       | Build the new Runner path only from an approved implementation ticket.                                                                              |
| Docker/Traefik stack                                                 | ADR-015 gives one public broker WS surface and keeps OpenClaw Gateway listeners private.                                                                                                                           | Extend that one ingress with a separately authenticated Runner path; do not expose a laptop port or public Gateway.                                 |

## Scope and neighboring owners

This resolution owns:

- Local Machine Enrollment and admitted cloud service identity;
- Runner key, protocol, boot and connection epochs;
- capability observation, compatibility policy, and hard safe maximum;
- durable typed command delivery and verified receipt ingress;
- Harness Supervisor, independently supervised Lease Enforcer, worktree/process containment, and
  reconciliation observation;
- lease-grant delivery/removal transport and confirmation facts;
- Slack/Ask Admin/MCP provenance translation into server-owned commands;
- deterministic conformance contracts for these seams.

It does not own:

- DevTicket commands, lane movement, Claim Attempt/Execution Lease creation, capacity reservation,
  resource release, or fresh-claim authorization — WF-230/Execution Admission own them;
- GitHub mirror/webhook/outbox/provider-fact policy — #231 owns it;
- Reviewer identity, Review checks/verdict, exclusive shared-Docker Review lease, evidence, or
  preview authorization — #229 owns them;
- Focused/Balanced/Custom scheduling, Sprint reservation, waiting, pause, preemption, dependency
  order, or Incident interruption — #233 owns them;
- retention/redaction — #235 owns final retention policy;
- multiple repositories, a second Active Sprint, or automatic cloud failover.

## Canonical identity and trust graph

```text
Human Admin / Human Owner
  ├─ authenticates to secure Opzava UI
  ├─ may use Slack Personal Assistant (mapped Slack installation + user)
  └─ may speak to Ask Admin (web session + conversation/turn)
       └─ both create provenance-bearing command requests only

Execution Assignee / agent-model identity
  └─ selected to do the work; never authenticates the machine by its name

Runner Enrollment (local machine key) OR admitted cloud service identity
  └─ authorizes one Runner endpoint and its current key/enrollment epoch
       └─ current Runner Connection Epoch (one active connection generation)
            ├─ signed Runner Capability Manifest
            └─ typed Runner Command Delivery
                 └─ Harness Supervisor
                      ├─ Codex Desktop Adapter (conditional modes/platforms)
                      ├─ Codex CLI Adapter
                      ├─ Claude Code Adapter
                      └─ process registration + per-Claim-Attempt DevTicket worktree generation

Claim Attempt + Execution Lease
  └─ server-owned execution authority bound to Runner, contract, fence, worktree, and grants
       └─ Runner may report facts for that exact authority; it cannot create or widen it
```

Separate identities can coexist on one physical computer without trust transitivity:

- an MCP Principal authenticates a user/session command request;
- an OpenClaw Device is an OpenClaw paired client identity;
- an OpenClaw Node is an OpenClaw capability-bearing runtime endpoint;
- a tool vendor login authenticates Codex/Claude to its vendor;
- a Runner Enrollment authenticates Opzava execution observations;
- a process registration identifies one OS process tree/worktree under one lease.

Possessing any one of these grants none of the others. Linking them records opaque correlation refs
only. Revoking one does not falsely claim the others were revoked; policy may independently fence
affected execution as a safety consequence.

## Deep Modules and Interfaces

| Module                           | Small Interface                                                                                     | Hidden implementation and ownership                                                                                                                              | Must never own                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Execution Admission** (WF-230) | Existing governed commands and verified-fact consumers                                              | ClaimRequested, Claim Attempt, assignment, capacity, Execution Lease, fences, start arbitration, Blocked/containment, release, fresh claim                       | Transport credentials, vendor process mechanics                          |
| **Runner Registry**              | `beginEnrollment`, `completeChallenge`, `rotateKey`, `revoke`, `evaluateCapabilities`, safe queries | enrollment grants, public keys, epochs, owner binding, capability manifests, compatibility policy, state/history                                                 | Claims, leases, lanes, process facts                                     |
| **Runner Protocol**              | `prepareDelivery(authorizedOrder)` and `admitFrame(authenticatedFrame)`                             | canonical bytes, signatures, key/epoch/version checks, outbox/inbox, dedupe, sequence/gap handling, connection sessions, liveness, detector/reconciliation facts | Shell strings, DevTicket authorization, lane/release decisions           |
| **Runner transport Adapter**     | Satisfies Runner Protocol's connection/delivery seam                                                | broker WSS route, TLS, framing, rate/body limits, backpressure, reconnect cursor                                                                                 | Browser principals, OpenClaw operator scopes, command policy             |
| **Harness Supervisor**           | `probe`, `launch`, `checkpoint`, `contain`, `reconcile` over typed plans                            | durable local journal, process groups, worktrees, descendants, Adapter calls, local grant attachment                                                             | Lease grant, lane change, arbitrary remote shell                         |
| **Lease Enforcer**               | `arm`, `renew`, `fence`, and safe status over signed authority                                      | independent OS supervision, monotonic deadline, kill-capable containment handle, daemon-loss grace, fail-closed stop/quarantine                                  | Workflow renewal, unsigned deadline extension, process output parsing    |
| **Harness Adapter**              | Vendor-neutral typed plan/result used by Supervisor                                                 | Codex Desktop, Codex CLI, Claude Code invocation/session/output translation                                                                                      | Runner key, lease renewal, secret resolution, workflow transition        |
| **Lease Secret Broker**          | `activateGrant`, `revokeGrant`, `confirmDisposition` using opaque handles                           | named-ref policy, secure local/cloud delivery, TTL, local removal, upstream revoke request and confirmation                                                      | Card storage of values, command authority, process containment inference |
| **Slack approval Adapter**       | `authenticateAndTranslate(interaction)`                                                             | Slack signature/time/install/team/user mapping, fast ACK, opaque action-token lookup, retry dedupe                                                               | Free-text approval, secret/enrollment/security mutation                  |
| **Ask Admin command Adapter**    | `requestCommand(turnContext, intent)`                                                               | current web-session/on-behalf-of provenance, turn/tool-call idempotency, safe summaries                                                                          | `operator.admin`, Human approval inference, Execution Lease              |
| **MCP command Adapter**          | `requestCommand(linkPrincipal, intent)`                                                             | link-token/session/membership/current-policy verification                                                                                                        | Runner enrollment, receipt signing, machine trust                        |

There are multiple real Harness Adapters, so that seam earns its existence. The Runner Protocol is
deep: callers learn two interfaces, while serialization, replay, cryptography, connection churn, and
reconciliation remain local to its implementation.

## Transport topology

```text
Local Runner daemon ── outbound wss://broker.<domain>/v1/runner ──┐
Cloud Runner service ─ outbound wss://broker.<domain>/v1/runner ─┼─ Traefik / one public broker ingress
Browser/PWA ─────────── existing browser/broker role/path ───────┘

Runner transport Adapter ── Runner Protocol ── Postgres outbox/inbox
                                               │
                                               └─ verified facts → WF-230 internal commands/workers
```

Rules:

- no inbound listener, port-forward, SSH, Docker socket, or vendor UI automation is exposed on the
  enrolled machine;
- the Runner initiates TLS and validates the Opzava origin/certificate;
- browser, Runner, and OpenClaw operator roles cannot reuse tokens, routes, frame kinds, or
  authorization middleware;
- tenant/workspace/Runner authority derives from the authenticated enrollment record. Frame fields
  are equality-checked correlation data, never caller-selected routing authority;
- broker disconnect does not delete outbox/inbox state. Postgres remains durable; Redis/WS presence
  is a hint;
- the broker-facing Adapter performs transport authentication and bounded parsing only. Domain
  commands run in the owning application/worker transaction after verified fact ingress.

## Enrollment and lifecycle

### Records

**Runner Enrollment** contains immutable Runner ID/type (`local_machine` or `cloud_service`),
tenant, owner/admitter, lifecycle, created/revoked times, current enrollment epoch, current key refs
and fingerprints, enabled control modes, and audit refs. It stores public keys only.

**Runner Key Authorization** contains key ID, algorithm, public key, enrollment epoch, status,
activation/revocation effective times, predecessor/successor, and proof refs.

**Runner Capability Manifest** contains manifest ID/version/hash, Runner build, OS/architecture,
boot incarnation, each installed Harness Adapter kind/version/mode and observed executable
version/identity, repository/worktree/process features, Docker/preview transport observations, Lease
Enforcer build plus purpose-scoped outcome public key/probe, implementation mode support, hard safe
implementation maximum, local/cloud secret eligibility, observed time, expiry, and assurance class.
It contains no machine secret, filesystem listing, credential, token, or arbitrary command output.

**Runner Connection Epoch** contains an Opzava-issued epoch, enrollment/key epoch, boot incarnation,
negotiated protocol/features, connected/closed times, last accepted transport cursor, current signed
time-anchor/uncertainty state, liveness, and supersession reason. Exactly one epoch can be current
for an enrollment.

### Secure enrollment ceremony

1. An authenticated Admin opens Runners and requests local enrollment in the secure Opzava UI. One
   server transaction creates a short-lived, single-use **Enrollment Grant** and its single-use
   **Local Enrollment Challenge**. The grant binds Admin/session, tenant, `local_machine` Runner
   type, allowed setup action, setup key, 256-bit grant nonce, expiry, and audit row. The challenge
   binds a UUID `challengeId`, grant ID, setup-key digest, fresh 256-bit `serverChallenge`, issue
   and expiry times, and `unused` state. It cannot be issued or consumed independently of that
   grant.
2. The bootstrap is delivered through stdin, OS credential exchange, or another mechanism that keeps
   the grant out of process arguments, shell history, Slack, Ask Admin, and model context.
3. The Runner daemon redeems only the public bootstrap fields, receives the challenge ID/value over
   the authenticated setup channel, generates an Ed25519 key locally, stores the private key in a
   platform-approved keystore, and sends the public key plus a signature over the exact challenge,
   setup key, protocol range, Runner build, and a fresh client nonce.

   ```text
   localEnrollmentProofSignature = Ed25519.sign(
     generatedRunnerKey,
     UTF8("opzava.runner.local-enrollment-proof.v1\0") ||
       RFC8785({ enrollmentGrantId, challengeId, serverChallenge, setupKey, grantNonce,
                 runnerPublicKey, protocolRange, runnerBuild, clientNonce })
   )
   ```

   The completion request is a closed object with exactly `protocolVersion`,
   `messageKind="runner.local_enrollment_completion"`, `enrollmentGrantId`, `challengeId`,
   `serverChallenge`, `setupKey`, `grantNonce`, `runnerPublicKey`, `protocolRange`, `runnerBuild`,
   `clientNonce`, and `localEnrollmentProofSignature`. `proofHash` for local replay is exactly
   `SHA256(UTF8("opzava.runner.local-enrollment-completion.digest.v1\0") || RFC8785(localCompletionRequest))`;
   no field is excluded.

4. The server atomically verifies the grant/challenge relation, current Admin/session/membership,
   expiry, unused state, proof, and unique client nonce; marks both grant and challenge consumed
   with the proof hash; assigns Runner/enrollment/key epoch 1; and displays the public-key
   fingerprint, command-root fingerprint, and safe machine label in the same UI. The completion
   response carries the Initial Server Command Trust Bootstrap defined below over this same
   authenticated setup channel. Exact replay of the same
   `(grantId, challengeId, clientNonce, proofHash)` returns the original enrollment; any changed
   key, nonce, proof, or payload under either consumed identity is a conflict and creates no
   enrollment.
5. The Runner verifies and durably pins the bootstrap command-root key/fingerprint before reporting
   setup complete. The Admin confirms both the Runner-key and command-root fingerprints plus the
   machine label before Active. Expiry, cancellation, role/session loss, tenant suspension, reused
   nonce, wrong origin, unsupported protocol, bootstrap transcript mismatch, unconfirmed
   fingerprint, or unapproved daemon build leaves no Active enrollment.
6. This local-machine grant cannot enroll a cloud service. Cloud uses the separate ceremony below.
   Challenge expiry/cancellation consumes no grant, but both records become unusable; retry creates
   a new grant and challenge rather than reviving either identity.

### Cloud service enrollment ceremony

Cloud execution is available only when provisioning configuration has an Active, versioned **Cloud
Workload Issuer Policy**. It pins an HTTPS OIDC issuer, allowed signature algorithms and issuer-key
policy, exact audience, exact workload subject/service-deployment identity, maximum token lifetime
and clock skew, and tenant/service eligibility. An arbitrary self-declared issuer URL, cloud API
key, GitHub token, or Runner-supplied tenant claim is never a trust anchor.

1. An authorized Platform Admin—an authenticated Human Owner/Admin exercising a current platform-
   scoped grant for this exact action, tenant/service scope, policy version, and expiry, not a new
   actor or transitive role—asks the provisioning worker to admit one named cloud service. That
   grant conveys no Runner, OpenClaw, GitHub, secret, lease, or workflow authority. One transaction
   creates a short-lived, single-use **Cloud Enrollment Grant** bound to tenant, exact issuer-policy
   version, audience, subject, service-deployment ID, `cloud_service` Runner type, UUID challenge
   ID, 256-bit server challenge, 256-bit grant nonce, expiry, and audit row.
2. The cloud service generates its Runner Ed25519 key in its service keystore and obtains a fresh
   workload-identity JWT from the pinned issuer. It submits the grant ID; public key; JWT; fresh
   client nonce; protocol/build range; and a Runner-key signature over the server challenge, grant
   nonce, public key, `workloadTokenDigest`, exact issuer/audience/subject/deployment tuple, and
   client nonce. The digest is
   `SHA256(UTF8("opzava.runner.cloud-workload-token.digest.v1\0") || UTF8(exactCompactJwt))`; the
   original compact JWT bytes are never normalized before verification.

   ```text
   cloudEnrollmentProofSignature = Ed25519.sign(
     generatedRunnerKey,
     UTF8("opzava.runner.cloud-enrollment-proof.v1\0") ||
       RFC8785({ cloudEnrollmentGrantId, challengeId, serverChallenge, grantNonce,
                 runnerPublicKey, workloadTokenDigest, issuer, audience,
                 subject, serviceDeploymentId, clientNonce, protocolRange, runnerBuild })
   )
   ```

   The cloud completion request is closed and contains exactly `protocolVersion`,
   `messageKind="runner.cloud_enrollment_completion"`, `cloudEnrollmentGrantId`, `challengeId`,
   `serverChallenge`, `grantNonce`, `runnerPublicKey`, `workloadToken`, `workloadTokenDigest`,
   `issuer`, `audience`, `subject`, `serviceDeploymentId`, `clientNonce`, `protocolRange`,
   `runnerBuild`, and `cloudEnrollmentProofSignature`. `cloudEnrollmentCompletionHash` is exactly
   `SHA256(UTF8("opzava.runner.cloud-enrollment-completion.digest.v1\0") || RFC8785(cloudCompletionRequest))`;
   it includes the exact compact workload token bytes carried as the request string. Replay identity
   is `(cloudEnrollmentGrantId,challengeId,clientNonce,cloudEnrollmentCompletionHash,tokenJti)`.

3. The provisioning worker verifies issuer signature/key policy; exact `iss`, `aud`, `sub`, and
   deployment binding; `iat`/`nbf`/`exp` bounds; unique `jti`; grant expiry/single use; token
   digest; and Runner-key possession. Tenant comes only from the grant. Missing `jti`, wildcard
   subject, changed tuple, replay, stale issuer-policy version, or unsupported algorithm fails
   closed.
4. One transaction consumes both grant and token `jti`, creates the cloud Runner/enrollment/key
   epoch, records `verified_workload_identity` assurance plus issuer-policy/token-proof hashes,
   returns the Initial Server Command Trust Bootstrap over the same authenticated completion
   channel, and enters Awaiting Platform Confirmation. Exact replay returns that record and the
   identical bootstrap for that exact replay identity; changed key/token/payload under the grant or
   `jti` is conflict.
5. The cloud Runner verifies and durably pins the bootstrap command root. The Platform Admin
   confirms the service label, exact workload tuple, Runner-key fingerprint, and command-root
   fingerprint before Active. The cloud Runner then performs the same connection and challenge-bound
   capability ceremonies as local. It never receives local Docker/Review capability and is never
   implicit failover.
6. Rotation requires a fresh server challenge, current Runner-key proof, and a new non-replayed
   workload token under the current issuer policy. Recovery without the current key uses the
   `Runner Recovery Grant` below, advances the existing Runner to a new enrollment epoch, and
   requires fresh workload proof plus Platform Admin confirmation. Enrollment/key/issuer-policy
   revocation atomically closes connection epochs and invokes the same loss/containment rules.

This is software workload-identity evidence, not hardware attestation. If no trusted issuer policy
is configured or its keys/metadata cannot be verified, cloud enrollment and cloud execution render
Unavailable; Opzava never falls back to a self-signed service identity. The conformance suite uses a
real local OIDC test issuer to prove token replay, issuer-key rotation/revoke, exact tenant/service
binding, key rotation/recovery, and cross-tenant denial.

### Lifecycle

```text
Pending → Awaiting Fingerprint Confirmation → Active ↔ Suspended
   └──────────────────────────────────────────────→ Revoked
Active/Suspended/Revoked + replacement ceremony → Re-enroll Required → new enrollment epoch
```

- **Suspended** rejects new connection/admission and triggers WF-230 loss detection for affected
  work. Security-reducing containment/revocation remains allowed.
- **Revoked** records an effective server time, advances the enrollment epoch, closes all connection
  epochs, fences affected leases through WF-230, rejects every later frame under old keys, and
  preserves history.
- Planned Runner-key rotation uses the canonical ceremony below. Recovery without the current key is
  secure-UI re-enrollment. Old and new keys never share an active signing epoch. Facts admitted
  before the atomic cutover retain their recorded disposition; facts received after it fail even if
  their Runner `observedAt` predates revocation.
- One connection epoch wins by server transaction. A later authenticated connection supersedes the
  earlier epoch; the old socket may remain physically open but cannot submit authoritative frames.

### Runner-key rotation and recovery ceremony

V1 rotates only while the enrollment has no Active execution/containment/grant and the Runner has
entered persisted `rotation_quiesced`: no new command action, ACK, semantic fact, capability probe,
or reconciliation observation may be journaled until rotation commits or the challenge expires and
quiescence is explicitly abandoned. The Runner freezes and signs its journal high-water marks; the
server must already have admitted every one. Otherwise the Runner must leave quiescence, replay
gaps, and start a new rotation challenge. This prevents an unsent old-key fact from becoming
unverifiable across cutover.

1. Runner Registry creates one persisted, expiring, single-use `runner_key_rotation_challenge` with
   UUID `rotationId`, Runner/tenant/type, current enrollment epoch/key ID, proposed next enrollment
   epoch, fresh 256-bit server nonce, current server rotation-drain cursors, issue/expiry times, and
   `unused` state. For `cloud_service`, it additionally binds the exact current issuer-policy
   version and workload issuer/audience/subject/deployment tuple. A purpose-authorized
   Registry-ceremony key signs. The local closed challenge schema is exactly
   `{ protocolVersion, messageKind:"runner.key_rotation_challenge", rotationId, runnerId, tenantId, runnerType:"local_machine", currentEnrollmentEpoch, currentKeyId, proposedEnrollmentEpoch, serverNonce, serverRotationDrainCursors, issuedAt, expiresAt, serverRegistryCeremonyKeyId, rotationChallengeSignature }`.
   The cloud schema replaces `runnerType` with `cloud_service` and additionally requires
   `{ issuerPolicyVersion, issuer, audience, subject, serviceDeploymentId }`; no other field is
   allowed.

   ```text
   rotationChallengeSignature = Ed25519.sign(
     serverRegistryCeremonyKey,
     UTF8("opzava.runner.key-rotation-challenge.v1\0") ||
       RFC8785(rotationChallengeWithoutSignature)
   )
   ```

   `serverRotationDrainCursors` is exactly
   `{ serverConfirmedDeliveryAckCursor, admittedExecutionFactSequenceByLease, admittedCapabilityFactSequence, admittedReconciliationFactSequence }`;
   each execution item is exactly `{ leaseId, admittedReceiptSequence }`, sorted by lease ID and
   duplicate-free.

2. While quiesced, the Runner persists a UUID `journalFreezeId` and a digest over the freeze record
   plus its exact signed high-water object. It then generates the replacement Ed25519 key locally
   and submits the closed object
   `{ rotationChallenge, newRunnerPublicKey, clientNonce, rotationQuiescenceAttestation, oldKeyProofSignature, newKeyProofSignature }`.
   A cloud Runner also submits `workloadToken` and `workloadTokenDigest`; those two fields are
   forbidden for a local Runner. The current and proposed keys sign the same exact closed transcript
   selected by Runner type:

   ```text
   localRotationProofBody = {
     protocolVersion, messageKind: "runner.key_rotation_completion",
     rotationId, runnerId, tenantId, currentEnrollmentEpoch, currentKeyId,
     proposedEnrollmentEpoch, serverNonce, newRunnerPublicKey, clientNonce,
     serverRotationDrainCursors, rotationQuiescenceAttestation, issuedAt, expiresAt
   }
   cloudRotationProofBody = {
     protocolVersion, messageKind: "runner.key_rotation_completion",
     rotationId, runnerId, tenantId, currentEnrollmentEpoch, currentKeyId,
     proposedEnrollmentEpoch, serverNonce, newRunnerPublicKey, clientNonce,
     serverRotationDrainCursors, rotationQuiescenceAttestation,
     workloadBinding: { issuerPolicyVersion, issuer, audience, subject,
                        serviceDeploymentId, workloadTokenDigest, tokenJti },
     issuedAt, expiresAt
   }
   rotationProofBody = localRotationProofBody | cloudRotationProofBody
   oldKeyProofSignature = Ed25519.sign(
     currentRunnerKey,
     UTF8("opzava.runner.key-rotation-old-proof.v1\0") || RFC8785(rotationProofBody)
   )
   newKeyProofSignature = Ed25519.sign(
     proposedRunnerKey,
     UTF8("opzava.runner.key-rotation-new-proof.v1\0") || RFC8785(rotationProofBody)
   )
   rotationProofRecord = {
     rotationProofBody, oldKeyProofSignature, newKeyProofSignature
   }
   rotationProofHash = SHA256(
     UTF8("opzava.runner.key-rotation-proof.digest.v1\0") ||
       RFC8785(rotationProofRecord)
   )
   ```

   For cloud rotation the raw `workloadToken` is excluded from `rotationProofHash`; the server first
   verifies its exact compact bytes, recomputes `workloadTokenDigest`, and requires that digest plus
   unique `tokenJti` to equal the signed `workloadBinding`. Thus token normalization cannot change
   replay identity and a different token/`jti` is collision.

   `rotationQuiescenceAttestation` is exactly
   `{ state:"rotation_quiesced", journalFreezeId, journalFrozenAt, runnerJournalHighWaterMarks, runnerPruneSafeAckCursors, runnerJournalFreezeDigest, prohibitedActions }`.
   `prohibitedActions` is the sorted exact array
   `["capability_probe","command_action","ordinary_semantic_fact","reconciliation_observation","transport_ack"]`.
   `runnerJournalHighWaterMarks` is exactly
   `{ lastJournaledDeliveryCursor, lastJournaledExecutionFactSequenceByLease, lastJournaledCapabilityFactSequence, lastJournaledReconciliationFactSequence }`;
   each execution item is exactly `{ leaseId, lastJournaledReceiptSequence }`, sorted by lease ID
   and duplicate-free. `runnerPruneSafeAckCursors` is exactly
   `{ durablyAckedExecutionFactSequenceByLease, durablyAckedCapabilityFactSequence, durablyAckedReconciliationFactSequence }`;
   each execution item is exactly `{ leaseId, durablyAckedReceiptSequence }`, sorted by lease ID and
   duplicate-free. A prune-safe cursor advances only after the Runner durably records the latest
   signed Server Fact Admission ACK revision whose disposition is `admitted` or
   `duplicate_admitted`; socket delivery or server admission alone cannot advance it. The frozen
   record is exactly
   `{ rotationId, journalFreezeId, runnerId, currentEnrollmentEpoch, runnerJournalHighWaterMarks, runnerPruneSafeAckCursors, frozenAt }`,
   where `frozenAt=journalFrozenAt`; its digest is
   `SHA256(UTF8("opzava.runner.rotation-journal-freeze.digest.v1\0") || RFC8785(freezeRecord))`.
   Autonomous-Enforcer facts are intentionally absent from this Runner-key freeze: their sequence
   and signing authority are independent of the enrollment key and may advance only through the
   closed authority-reducing contract while rotation is quiesced. Their server cursor is preserved,
   not reset or cut over by Runner-key rotation.

3. One transaction locks enrollment, challenge, inbox cursors, leases, grants, and connection
   epochs; verifies both proofs, expiry, nonce uniqueness, exact next epoch, no active authority,
   `rotationQuiescenceAttestation.journalFrozenAt` within the challenge interval, the freeze digest,
   and the attestation signed inside both old/new proof transcripts. It requires the Runner's
   delivery high-water to equal `serverConfirmedDeliveryAckCursor`, every fact-family journal
   high-water to equal the corresponding server-admitted contiguous cursor, and every
   `runnerPruneSafeAckCursors` value to equal that same server-admitted cursor, with identical lease
   sets. A lower, higher, missing, or added value rejects rotation and cannot be waived. When a fact
   admission committed but its ACK was lost, the rejection transaction marks the challenge terminal
   without changing either key. Only after the Runner receives that authenticated terminal result
   may it abandon the freeze; the server then retransmits the latest stored signed ACK revision
   while the old enrollment key remains current. The Runner durably records it and retries a new
   rotation challenge/freeze. Rotation never revokes the only key before all admitted old-key facts
   are prune-safe. For cloud, it also verifies the fresh pinned-issuer token and atomically consumes
   its unique `jti`; consumes the challenge; authorizes the new key at the new enrollment epoch;
   revokes the old key at the same server cutover instant; and closes every old connection epoch. It
   also creates and returns the new enrollment-epoch-scoped trust-bundle chain at version 1, signed
   by the already pinned command root; the Runner must durably accept that bundle before
   reconnecting. Exact replay of `(rotationId, clientNonce, rotationProofHash)` returns the original
   cutover and identical bundle; a changed proof/key/nonce/token is collision. No partial key state
   commits.
4. Recovery without the current key is a separate secure-UI ceremony, never an unsigned rotation. It
   is available only when the recovering installation still has the pinned command-root key, root
   epoch, and last accepted trust-bundle hash. Without that state, the Admin must perform full
   enrollment with a new Runner ID; the old Runner is revoked/lost and linked as history, never
   silently adopted.

   An authorized Admin (Platform Admin for cloud) creates a single-use `Runner Recovery Grant` and
   the Registry-ceremony-key-signed challenge below. Its local closed schema is exactly
   `{ protocolVersion, messageKind:"runner.key_recovery_challenge", recoveryGrantId, challengeId, runnerId, tenantId, runnerType:"local_machine", priorEnrollmentEpoch, proposedEnrollmentEpoch, serverChallenge, grantNonce, recoveryReason, confirmedExecutionState, trustBundleVersion, trustBundleHash, rootEpoch, issuedAt, expiresAt, serverRegistryCeremonyKeyId, recoveryChallengeSignature }`.
   `recoveryReason` is exactly `key_lost`, `keystore_reset`, or `installation_replaced`;
   `confirmedExecutionState` is `contained` or `unknown`. The cloud variant replaces Runner type
   with `cloud_service` and adds exactly `issuerPolicyVersion`, `issuer`, `audience`, `subject`, and
   `serviceDeploymentId`. The signature and hash are:

   Before challenge delivery, the authenticated recovery channel may supply every missing
   same-enrollment bundle in strict hash order; the installation verifies them from its pinned root
   and ACKs the current hash. It may not skip a bundle or replace a missing root. The challenge's
   Registry key must be purpose-authorized by that resulting current bundle.

   ```text
   recoveryChallengeSignature = Ed25519.sign(
     serverRegistryCeremonyKey,
     UTF8("opzava.runner.key-recovery-challenge.v1\0") ||
       RFC8785(recoveryChallengeWithoutSignature)
   )
   recoveryChallengeHash = SHA256(
     UTF8("opzava.runner.key-recovery-challenge.digest.v1\0") ||
       RFC8785(recoveryChallenge)
   )
   ```

   The installation verifies that signature through its intact pinned trust chain, equality-checks
   the Runner/enrollment/root/bundle identities, generates the replacement key, and signs the local
   closed body
   `{ protocolVersion, messageKind:"runner.key_recovery_completion", recoveryChallengeHash, recoveryGrantId, challengeId, runnerId, tenantId, runnerType:"local_machine", priorEnrollmentEpoch, proposedEnrollmentEpoch, serverChallenge, grantNonce, trustBundleVersion, trustBundleHash, rootEpoch, newRunnerPublicKey, clientNonce, issuedAt, expiresAt }`.
   The cloud body replaces the type and adds exactly
   `workloadBinding:{ issuerPolicyVersion, issuer, audience, subject, serviceDeploymentId, workloadTokenDigest, tokenJti }`.

   ```text
   recoveryProofSignature = Ed25519.sign(
     replacementRunnerKey,
     UTF8("opzava.runner.key-recovery-new-proof.v1\0") || RFC8785(recoveryProofBody)
   )
   recoveryProofRecord = { recoveryProofBody, recoveryProofSignature }
   proofHash = SHA256(
     UTF8("opzava.runner.key-recovery-proof.digest.v1\0") ||
       RFC8785(recoveryProofRecord)
   )
   ```

   The local completion request contains exactly the local body fields plus
   `recoveryProofSignature`; the cloud request contains exactly the cloud body fields plus
   `workloadToken` and `recoveryProofSignature`. The raw cloud workload token is excluded from
   `proofHash`; its exact `workloadTokenDigest` and `tokenJti` are already inside the signed body.
   Cloud recovery verifies a fresh pinned-issuer token and atomically consumes its `jti`. No current
   Runner-key signature is accepted or expected.

   One transaction consumes grant/challenge/token, verifies current Admin authorization, challenge
   delivery transcript, intact trust-chain binding, and new-key proof; advances the existing Runner
   to exactly the proposed epoch; authorizes only the new key; revokes every old key; closes old
   connections; creates a new enrollment-epoch-scoped trust-bundle chain at version 1 under the
   still-pinned root; and enters Awaiting Fingerprint/Platform Confirmation. The authenticated
   completion response returns that new bundle and its root-chain proof. The installation pins it
   atomically, and the Admin confirms the replacement Runner-key and unchanged command-root
   fingerprints before Active. Exact `(recoveryGrantId, challengeId, clientNonce, proofHash)` replay
   over an authenticated completion-replay channel returns the identical result; changed content is
   collision. Neither recovery adopts an old socket, sequence, lease, grant, or process authority;
   any unadmitted old Runner-key fact remains evidence-only. Independently Enforcer-signed
   authority-reducing autonomous containment facts may still be admitted under their closed source
   contract; affected execution otherwise remains unknown/contained.

### Authenticated WSS connection establishment

An HTTP upgrade on the Runner route creates only a rate-limited **Provisional Socket**. It carries
no Runner authority and accepts only the connection ceremony below. TLS protects transport, while
proof of the enrolled private key authenticates the Runner; neither a bearer query parameter nor a
browser/OpenClaw/MCP token can substitute for that proof.

```text
Provisional Socket
  → connection_challenge issued
  → connection_proof verified
  → epoch transaction commits (old epoch superseded)
  → connection_accepted verified by Runner
  ├─ admitted Enforcer key exists → signed time-anchor exchange
  │    ├─ accepted → connection_ready { available } → Current
  │    └─ unavailable → connection_ready { unavailable } → DiagnosticsOnly
  │         → bounded time-anchor retry → accepted anchor promotes the same epoch to Current
  └─ no admitted Enforcer key → connection_ready { unavailable,
       enforcer_key_not_admitted } → DiagnosticsBootstrap
       → one capability challenge/submission/ACK → narrow Enforcer key admission
       → signed time-anchor exchange → accepted anchor promotes the same epoch to Current
```

1. The Runner opens the dedicated WSS role/path and sends an unsigned bounded `runner_hello`
   containing only Runner ID, enrollment/key epoch and key ID, boot incarnation, a fresh 256-bit
   client nonce, supported protocol/features, and one `reportedReconnectCursors` object. These are
   lookup/correlation claims only.
2. The server loads the current Active enrollment and sends a single-use `connection_challenge`
   containing challenge ID, fresh 256-bit server nonce, client-nonce echo, expected enrollment/key
   epoch, allowed and required protocol features, server outbox high-water mark, issued/expiry
   times, and the hash of the received hello. A challenge is scoped to one provisional socket and is
   persisted as unused/expired/consumed.
3. The Runner returns a signed `connection_proof` over the domain-separated canonical transcript:
   hello, challenge, both nonces, boot incarnation, offered protocol/features, and its last
   journaled delivery and receipt cursors. Reuse on another socket, changed transcript bytes,
   expired/consumed challenge, or a stale/revoked enrollment/key fails before an epoch exists.
4. The server chooses the highest mutually allowed protocol and exact feature set; the client cannot
   force a downgrade. If any required feature is absent from Runner support, the server rejects the
   provisional socket before creating an epoch. One transaction consumes the challenge, records the
   negotiated transcript hash and authoritative reconnect cursors, increments the enrollment's
   connection epoch, marks that epoch `AuthenticatedPendingReady`, and supersedes every earlier
   epoch. From that commit, old-socket frames fail even if the old TCP connection remains open.
5. The server sends a signed `connection_accepted` binding the new epoch, transcript hash,
   negotiated protocol/features, one `authoritativeReplayCursors` object, server time, and
   trust-bundle version. That object contains `serverConfirmedDeliveryAckCursor`,
   `deliveryReplayAfterCursor`, sorted `executionFactReplayAfterSequenceByLease[]`,
   `autonomousFactReplayAfterSequenceByLease[]`, `capabilityFactReplayAfterSequence`, and
   `reconciliationFactReplayAfterSequence`. The server-confirmed delivery ACK cursor and each fact
   cursor are the server's greatest contiguous admitted values. `deliveryReplayAfterCursor` is the
   effective lower replay boundary defined below. Every cursor is inclusive. The Runner verifies it,
   persists/ACKs every missing trust bundle through the specialized path below. When an admitted
   Enforcer outcome key exists, the Runner first completes the signed time-anchor exchange and then
   replies with signed `connection_ready` under that exact epoch/transcript, accepted trust bundle,
   and available or unavailable anchor result. An available binding atomically marks the epoch
   `Current`; an unavailable binding marks it `DiagnosticsOnly`, which permits only bounded time-
   anchor retry and live ACK/trust control frames. A later accepted retry promotes the same epoch
   without a second `connection_ready`. On a first enrollment, where no Enforcer key can yet sign
   the echo, the Runner instead replies immediately with unavailable reason
   `enforcer_key_not_admitted`; admission of that `connection_ready` marks the epoch
   `DiagnosticsBootstrap`, not `Current`. No command delivery or Runner fact is accepted before
   `connection_ready`, and that bootstrap state permits only the closed first-capability/ACK/anchor
   exception below. No execution, containment authority, reconciliation, trust rotation, provider
   action, grant/preview action, or other Registry order is available until an accepted time anchor
   atomically promotes this same epoch to `Current`.

The ceremony objects are closed schemas. `runner_hello` contains exactly `protocolVersion`,
`messageKind="runner.hello"`, `runnerId`, `enrollmentEpoch`, `keyId`, `bootIncarnation`,
`clientNonce`, `supportedProtocols`, `supportedFeatures`, and `reportedReconnectCursors`.
`connection_challenge` contains exactly `protocolVersion`,
`messageKind="runner.connection_challenge"`, `challengeId`, `runnerId`, `expectedEnrollmentEpoch`,
`expectedKeyId`, `serverNonce`, `clientNonceEcho`, `runnerHelloHash`, `allowedProtocols`,
`allowedFeatures`, `requiredFeatures`, `serverOutboxHighWaterMark`, `issuedAt`, `expiresAt`,
`serverConnectionKeyId`, and `challengeSignature`. `connection_proof` contains exactly
`protocolVersion`, `messageKind="runner.connection_proof"`, `runnerHelloHash`, `challengeId`, and
`connectionProofSignature`. `connection_accepted` contains exactly `protocolVersion`, `messageKind`,
`runnerId`, `enrollmentEpoch`, `keyId`, `connectionEpoch`, `bootIncarnation`, `transcriptHash`,
`selectedProtocol`, `selectedFeatures`, `authoritativeReplayCursors`, `serverTime`,
`trustBundleVersion`, `serverConnectionKeyId`, and `connectionAcceptedSignature`; its `messageKind`
is exactly `runner.connection_accepted`. `connection_ready` contains exactly `protocolVersion`,
`messageKind="runner.connection_ready"`, `runnerId`, `enrollmentEpoch`, `keyId`, `connectionEpoch`,
`bootIncarnation`, `transcriptHash`, `acceptedFrameHash`, `acceptedTrustBundleVersion`,
`acceptedTrustBundleHash`, `timeAnchorBinding`, and `connectionReadySignature`. `timeAnchorBinding`
is exactly `{ kind:"available", timeAnchorId }` or `{ kind:"unavailable", reasonCode }`.
Protocol/feature arrays and every replay-cursor array are present, sorted, and duplicate-free.

The proof and negotiated transcript use the canonical encoding defined below:

```text
runnerHelloHash = SHA256(
  UTF8("opzava.runner.connection-hello.digest.v1\0") || RFC8785(runnerHello)
)
challengeSignature = Ed25519.sign(
  serverConnectionKey,
  UTF8("opzava.runner.connection-challenge.v1\0") ||
    RFC8785(connectionChallengeWithoutSignature)
)
connectionProofSignature = Ed25519.sign(
  enrolledRunnerKey,
  UTF8("opzava.runner.connection-proof.v1\0") ||
    RFC8785({ runnerHello, connectionChallenge })
)
connectionTranscriptHash = SHA256(
  UTF8("opzava.runner.connection-transcript.v1\0") ||
    RFC8785({ runnerHello, connectionChallenge, connectionProofWithoutSignature,
              selectedProtocol, selectedFeatures })
)
connectionAcceptedSignature = Ed25519.sign(
  serverConnectionKey,
  UTF8("opzava.runner.connection-accepted.v1\0") ||
    RFC8785(connectionAcceptedWithoutSignature)
)
connectionAcceptedHash = SHA256(
  UTF8("opzava.runner.connection-accepted.digest.v1\0") ||
    RFC8785(connectionAccepted)
)
connectionReadySignature = Ed25519.sign(
  enrolledRunnerKey,
  UTF8("opzava.runner.connection-ready.v1\0") ||
    RFC8785(connectionReadyWithoutSignature)
)
```

`connectionChallenge.runnerHelloHash` must equal `runnerHelloHash` before the proof is verified. The
Runner verifies `challengeSignature` under the purpose-authorized connection-acceptance key before
signing any proof. `connectionReady.acceptedFrameHash` must equal `connectionAcceptedHash` before
readiness is committed.

The pinned Server Command Trust Bundle authorizes `serverConnectionKey` for connection acceptance
only. Both nonce values and the challenge ID are inside the proof/transcript; changing selection
after proof changes the transcript hash. The server persists their hashes and consumption state so
socket reconnect, broker retry, and database failover cannot reuse them.

`runnerHello.reportedReconnectCursors` contains `lastJournaledDeliveryCursor`, a sorted
`lastSentExecutionFactSequenceByLease[]`, sorted `lastSentAutonomousFactSequenceByLease[]`, and the
last capability and reconciliation sequences. Its closed schema is exactly
`{ lastJournaledDeliveryCursor, lastSentExecutionFactSequenceByLease, lastSentAutonomousFactSequenceByLease, lastCapabilityFactSequence, lastReconciliationFactSequence }`;
each execution item is exactly `{ leaseId, lastSentReceiptSequence }`; each autonomous item is
exactly `{ leaseId, enforcerKeyId, lastSentEnforcerFactSequence }`.
`connection_accepted.authoritativeReplayCursors` is exactly
`{ serverConfirmedDeliveryAckCursor, deliveryReplayAfterCursor, executionFactReplayAfterSequenceByLease, autonomousFactReplayAfterSequenceByLease, capabilityFactReplayAfterSequence, reconciliationFactReplayAfterSequence }`;
each execution item is exactly `{ leaseId, replayAfterReceiptSequence }`; each autonomous item is
exactly `{ leaseId, enforcerKeyId, replayAfterEnforcerFactSequence }`. Execution arrays are sorted
by lease ID; autonomous arrays are sorted by `(leaseId,enforcerKeyId)`; all are duplicate-free.
`serverConfirmedDeliveryAckCursor` is the greatest contiguous ACKed outbox cursor for that Runner
stream; an ACK above a hole is stored but cannot advance it. The server computes and serializes
`deliveryReplayAfterCursor = min(runnerHello.reportedReconnectCursors.lastJournaledDeliveryCursor, serverConfirmedDeliveryAckCursor)`
and starts replay **exclusively after** it, at `deliveryReplayAfterCursor + 1`. Both delivery fields
are durable unsigned-decimal outbox positions, not counts or next-pointers; `"0"` means none. A
behind report safely replays duplicates. An ahead report cannot skip work: the effective cursor is
bounded by server truth and the discrepancy is recorded. Each fact replay cursor is independently
the server's greatest contiguous admitted semantic-fact sequence, inclusive.

The execution replay array's lease set is the exact sorted union of (a) every execution-fact scope
the server retains for this Runner/enrollment epoch and (b) every lease ID in the Runner hello's
`lastSentExecutionFactSequenceByLease`. A Runner-reported lease with no server-admitted fact is
included with `replayAfterReceiptSequence="0"`; a server-known lease absent from the Runner report
is still included at the server cursor and records a reconciliation discrepancy. Omission never
means zero, unknown, or "do not replay." A Runner that has a local execution-fact journal for a
lease but omitted that lease from hello is protocol-invalid and remains reconciliation-only. The
autonomous replay array follows the same union/omission rule keyed by `(leaseId,enforcerKeyId)`; an
unknown server cursor is `"0"`. Its sequence/signer scope survives Runner enrollment rotation or
recovery but never authorizes a non-autonomous fact.

Execution-fact replay starts exclusively after the server's last admitted contiguous sequence for
each lease; capability and reconciliation replay use the corresponding server values in
`connection_accepted.authoritativeReplayCursors`. A higher Runner report is evidence only and a gap
remains `pending_gap`. The Runner re-embeds each unchanged connection-independent semantic fact
after the communicated value inside a newly signed current-connection transport frame. Losing
`connection_accepted` simply causes a new challenge and a newer epoch—an unready epoch never
receives work and an old epoch is never revived.

The outer frame's `bootIncarnation` identifies the current transporting daemon. An inner fact's
`bootIncarnation` identifies the daemon incarnation that originally journaled and signed that fact.
They must match for a newly produced fact, but an immutable replay after daemon restart retains the
old inner value. The server accepts that replay only when the inner boot matches a previously
authenticated connection epoch for the same Runner/enrollment/key and the sequence/digest is the
next admissible journal item. The current outer boot remains independently equality-bound to the
current connection; restart never rewrites an inner fact.

### Capability assurance and policy

| Assurance                     | Meaning                                                                                                                                     | Eligibility                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `verified_adapter`            | Key possession plus challenge-bound report from an approved Runner daemon/Adapter build, supported protocol, and current version/mode probe | May execute only the intersected effective capabilities     |
| `self_reported`               | Signed observation from the host, but Adapter/build/executable identity cannot be matched to approved policy                                | Visible for diagnosis; no implementation lease              |
| `unsupported_or_unverifiable` | Missing, stale, downgraded, inconsistent, revoked, or forbidden capability evidence                                                         | No claim/start; active work is contained as policy requires |

`verified_adapter` is software compatibility evidence, not hardware-rooted integrity. V1 does not
defend against a hostile machine owner replacing the daemon and forging its own observations. The
product must say “compatible/verified Adapter” rather than “trusted device attestation.”

Effective capability is the intersection of:

```text
signed observed manifest
∩ approved Runner daemon/Adapter build range
∩ platform tool/version/mode matrix
∩ tenant policy and current enrollment settings
∩ current health/freshness
```

Stale or changed capability never silently narrows a running process while pretending it stopped. It
blocks new admission and invokes the exact WF-230 containment/loss path when an active lease no
longer has its required capability.

Capability evidence follows a typed, challenge-bound sequence; connection establishment alone never
makes a Runner execution-eligible. `DiagnosticsBootstrap` closes the first-enrollment Enforcer-key/
time-anchor cycle without granting authority:

1. On a `Current` connection, or exactly once on a fresh `DiagnosticsBootstrap` epoch with no prior
   capability observation or admitted Enforcer key, Runner Registry issues a signed
   `capability_manifest_challenge` order with challenge ID/nonce, expected
   enrollment/key/connection/boot, required probe schema and policy version, the complete
   allowlisted probe specifications and managed-enforcement deny canaries with expected outcomes,
   their digests, prior manifest hash/sequence, and expiry.
2. The Runner performs only the allowlisted probes and sends a signed
   `capability_manifest_submission` Semantic Runner Fact in an authenticated ready-epoch transport
   frame with the exact challenge/nonce, monotonically increasing `capabilitySequence`, manifest
   object/hash, complete signed probe-result and deny-canary receipt bodies plus their digests,
   Lease Enforcer outcome public key and challenge-bound key-possession proof, observed/expiry
   times, and no arbitrary command output. Submission does not self-approve a capability.
3. Runner Registry verifies challenge single use, signature, sequence, schema, freshness, daemon and
   Adapter build identities, executable/tool/version/mode probes, Enforcer-key proof, every result
   body against its challenge specification/expected outcome, and each Managed Harness Enforcement
   Adapter challenge/canary/key proof. It persists the immutable observation, then policy evaluation
   writes a separate **Capability Admission** with effective capability digest, assurance class,
   allowed Harness Adapter/tool/version/modes/features, effective isolation/repository features,
   admitted managed enforcement bindings, hard safe implementation maximum, local/cloud eligibility,
   policy and Adapter-authorization versions, and expiry.
4. On the first bootstrap only, admission of the proved Enforcer outcome key permits the specialized
   signed time-anchor exchange. An accepted anchor atomically promotes the epoch from
   `DiagnosticsBootstrap` to `Current`; a bounded transient anchor failure leaves it diagnostics-
   only for the allowed retry, while an expired submission or unverifiable key closes the epoch into
   secure recovery/re-enrollment. Only after promotion does a `capability_manifest_admitted` or
   `capability_manifest_rejected` Semantic Runner Order, signed by the purpose-authorized server
   semantic-order key, bind the submission and admission/reason code. Execution Admission may use
   only the current persisted Capability Admission; a Runner cannot claim eligibility from the
   result order itself.

The bootstrap challenge/submission is non-authority diagnostics. It may run only the complete
server-allowlisted probes and one-use deny canaries bound into the challenge; it cannot create or
adopt a worktree, activate/use a grant, open a preview, spawn/continue a process, mutate Git or a
provider, issue another command family, or satisfy execution eligibility. Because no signed time
anchor exists yet, the server evaluates `challengeExpiresAt` against its trusted receive time. A
submission received after that bound is admitted only as authenticated stale sequence-closing
evidence, receives its signed fact-admission ACK, and never admits a capability or Enforcer key. The
server then terminally closes that bootstrap epoch into secure recovery/re-enrollment; it does not
wait for impossible `Current` authority or send a semantic result order. A second bootstrap
challenge, a second changed submission, any non-capability fact, or any other semantic order in
`DiagnosticsBootstrap` is rejected before journaling or side effect.

The bootstrap writes a separate narrow **Enforcer Key Admission** only after the challenge-bound
key-possession proof, Runner/enrollment/boot identity, approved Enforcer build identity, and key-ID/
bytes uniqueness verify. That record authorizes only time-anchor echo verification and autonomous
authority-reducing outcomes; it is not Capability Admission or execution eligibility. Other probe/
canary failures may still yield a rejected Capability Admission after anchor promotion. Invalid or
unverifiable Enforcer-key proof cannot create this record, so the epoch remains diagnostics-only and
must close into secure recovery/re-enrollment rather than bypass the anchor.

The challenge payload's expected key ID, connection epoch, and boot incarnation must equal its
persisted original delivery envelope plus the submitted ordinary-fact signer/manifest producer
identities. The challenge/order is never redelivered under another connection. If the Runner
journaled the submission but disconnected before server admission, it replays that unchanged fact
inside a newly authenticated `DiagnosticsBootstrap` outer frame when the Enforcer key is still
unadmitted, or inside a `Current` outer frame when the original valid submission already admitted
the key and the reconnect completed an anchor. The server verifies `expectedConnectionEpoch` against
the stored original envelope, not the replay frame; no second challenge is issued. If the challenge
is now expired/superseded or the producer boot is invalid, the server admits the authenticated fact
only to close its contiguous capability sequence, marks it stale evidence, delivers the ACK, and
closes the bootstrap epoch into recovery/re-enrollment without creating Capability Admission. A new
enrollment and challenge/sequence are required for current capability. Changed inner bytes, a
producer boot/key that never held the original connection, or a second fact for the same challenge
is collision.

Capability digests and the Enforcer-key proof use these exact constructions:

```text
probeBody = probeResult_without(probeResultDigest)
probeResultDigest = SHA256(
  UTF8("opzava.runner.capability-probe.digest.v1\0") || RFC8785(probeBody)
)
manifestBody = capabilityManifest_without(capabilityManifestHash)
capabilityManifestHash = SHA256(
  UTF8("opzava.runner.capability-manifest.digest.v1\0") || RFC8785(manifestBody)
)
enforcerKeyProofSignature = Ed25519.sign(
  enforcerOutcomePrivateKey,
  UTF8("opzava.runner.enforcer-key-proof.v1\0") ||
    RFC8785({ challengeId, challengeNonce, enforcerKeyId,
              enforcerOutcomePublicKey, capabilityManifestHash })
)
enforcementKeyProofSignature = Ed25519.sign(
  enforcementDecisionPrivateKey,
  UTF8("opzava.runner.managed-enforcement-key-proof.v1\0") ||
    RFC8785({ challengeId, challengeNonce, enforcementAdapterId,
              enforcementAdapterBuildDigest, clientKind, clientVersion,
              enforcementMode, profileRevision, policyRevision,
              enforcementDecisionKeyId, enforcementDecisionPublicKey,
              bypassCoverageDigest, denyCanaryReceiptDigests })
)
effectiveCapabilityBody = {
  allowedAdapterRows, effectiveIsolationFeatures, effectiveRepositoryFeatures,
  managedEnforcementAdmissions, hardSafeImplementationMaximum,
  localExecutionEligible, cloudExecutionEligible, localReviewEligible,
  policyVersion, adapterPolicyVersion, adapterAuthorizationVersion
}
effectiveCapabilityDigest = SHA256(
  UTF8("opzava.runner.effective-capability.digest.v1\0") ||
    RFC8785(effectiveCapabilityBody)
)
admissionBody = capabilityAdmission_without(capabilityAdmissionHash)
capabilityAdmissionHash = SHA256(
  UTF8("opzava.runner.capability-admission.digest.v1\0") || RFC8785(admissionBody)
)
```

Each `probeSpecification` is a closed object with exactly `probeId`, `probeSchemaVersion`,
`probeKind`, `subjectKind`, `subjectId`, `expectedObservationRule`, and `expectedResultCode`, sorted
by probe ID. Each `managedEnforcementCanary` is exactly
`{ canaryId, sentinelId, sentinelTargetRef, enforcementAdapterId, projectedToolName, approvedToolSchemaHash, canonicalArgumentsDigest, targetBindingDigest, expectedDecision:"deny", expectedReasonCode }`,
sorted by `(enforcementAdapterId,canaryId)`. Their array digests use respectively
`opzava.runner.capability-probe-specifications.digest.v1\0` and
`opzava.runner.managed-enforcement-canaries.digest.v1\0` over the complete sorted arrays. The
challenge binds both bodies and digests; changed order, missing/extra identity, or a result for an
unlisted probe/canary is rejection.

The server-owned `sentinelTargetBinding` is exactly
`{ sentinelId, sentinelTargetRef, enforcementAdapterId, routeId, expiresAt }`; its digest is
`SHA256(UTF8("opzava.runner.managed-enforcement-sentinel-target.digest.v1\0") || RFC8785(sentinelTargetBinding))`.
`sentinelTargetRef` is an opaque one-challenge route resolved only by the approved Adapter and is
not a credential-bearing URL. The canary's `targetBindingDigest` must equal that record; expiry or
cross-challenge/Adapter use rejects before invocation.

Each `probeResult` is a closed object with exactly `probeId`, `probeSchemaVersion`, `probeKind`,
`subjectKind`, `subjectId`, `observedIdentityDigest`, `resultCode`, `safeReasonCodes`, `observedAt`,
`expiresAt`, and `probeResultDigest`. `probeKind`, `subjectKind`, and `resultCode` are versioned
enums. The safe-reason array is sorted; raw command output is forbidden.

Each challenge-time `denyCanaryReceipt` is the closed object
`{ canaryId, sentinelId, sentinelTargetRef, challengeId, challengeNonce, enforcementAdapterId, enforcementAdapterBuildDigest, projectedToolName, approvedToolSchemaHash, canonicalArgumentsDigest, targetBindingDigest, decision:"deny", reasonCode, forwardingDisposition:"not_forwarded", decidedAt, enforcementDecisionKeyId, denyCanaryReceiptDigest, denyCanaryReceiptSignature }`.
Its digest/signature remove the digest and then signature under
`opzava.runner.managed-enforcement-deny-canary.digest.v1\0` and
`opzava.runner.managed-enforcement-deny-canary.signature.v1\0`. The canary identity, tool, schema,
arguments, target, decision, reason, and non-forwarded disposition must exactly equal the signed
challenge specification. Runner Registry verifies the signature under the proposed decision public
key and independently verifies through the approved loopback sentinel that no call reached the
target; a self-reported digest without both the receipt body and sentinel evidence is
`unsupported_or_unverifiable`.

The server-owned `canarySentinelObservation` is the closed record
`{ canaryId, challengeId, targetBindingDigest, sentinelId, observationWindowStartedAt, observationWindowEndedAt, observedCallCount:"0", sentinelPolicyVersion, sentinelObservationDigest }`.
Its digest removes only the digest under
`opzava.runner.managed-enforcement-canary-sentinel.digest.v1\0`. The sentinel target is created by
Runner Registry, is unreachable except through the challenge-bound route, and records calls
independently of the Runner/Harness. Admission requires the exact zero-call observation window to
close after the deny receipt; a missing, nonzero, wrong-target, or Runner-supplied observation
rejects the row.

`bypassCoverage` is the closed object
`{ enforcementAdapterId, clientKind, clientVersion, enforcementMode, policyRevision, invocationRoutes }`.
Each `invocationRoutes[]` item is exactly
`{ routeId, routeKind, executableIdentityDigest, expectedDisposition, probeId }`, sorted by route
ID; `routeKind` is `managed_entry`, `direct_cli`, `direct_socket`, `plugin_hook`, or `mcp_tool`, and
`expectedDisposition` is `managed_only` or `blocked`. `bypassCoverageDigest` is
`SHA256(UTF8("opzava.runner.managed-enforcement-bypass-coverage.digest.v1\0") || RFC8785(bypassCoverage))`.
The challenge's probe specifications must name every route permitted by the server's approved
client/build inventory. Runner Registry independently matches the probe/sentinel results to each
row; missing routes, an unblocked direct route, or a caller-selected inventory rejects admission.

`capabilityManifest` is a closed object with exactly `protocolVersion`, `manifestId`,
`manifestSchemaVersion`, `runnerId`, `enrollmentEpoch`, `capabilitySequence`, `challengeId`,
`challengeNonce`, `runnerBuildId`, `runnerBuildVersion`, `osKind`, `osVersion`, `architecture`,
`bootIncarnation`, `adapterRows`, `isolationFeatures`, `repositoryFeatures`,
`dockerReviewObservation`, `previewTransportObservation`, `enforcerKeyId`,
`enforcerOutcomePublicKey`, `managedEnforcementRows`, `probeResultDigests`,
`hardSafeImplementationMaximum`, `executionModes`, `secretGrantClasses`, `observedAt`, `expiresAt`,
and `capabilityManifestHash`. Each `adapterRows[]` item is the closed object
`{ adapterId, adapterKind, adapterVersion, adapterBuildDigest, toolKind, toolObservedVersion, executableIdentityDigest, controlModes, supportedFeatures, probeResultDigests }`.
Each `managedEnforcementRows[]` item is the closed object
`{ enforcementAdapterId, enforcementAdapterBuildDigest, clientKind, clientVersion, enforcementMode, profileRevision, policyRevision, enforcementDecisionKeyId, enforcementDecisionPublicKey, bypassCoverageDigest, denyCanaryReceiptDigests, enforcementKeyProofSignature, probeResultDigests }`.
`enforcementMode` is exactly `native_pre_call_hook` or `runner_loopback_policy_proxy`; the challenge
can admit it only when direct bypass routes are absent/blocked and every challenge-specific deny
canary is verified. Rows are sorted by enforcement-adapter ID. `dockerReviewObservation` and
`previewTransportObservation` are closed `{ capabilityState, safeReasonCodes, probeResultDigests }`
objects. Feature, mode, grant-class, reason, and digest arrays are always present, sorted, and
duplicate-free.

Capability object arrays have no implicit ordering: `adapterRows` sorts by the scalar identity
`(adapterId,adapterVersion,toolKind)`; `managedEnforcementRows` by
`(enforcementAdapterId,enforcementAdapterBuildDigest,enforcementDecisionKeyId)`; `probeResults` by
`(probeId,probeResultDigest)`; `allowedAdapterRows` by
`(adapterId,adapterVersion,toolKind,managedEnforcementAdmissionId)`; and
`managedEnforcementAdmissions` by
`(managedEnforcementAdmissionId,enforcementAdapterId,enforcementDecisionKeyId)`. Nested
`controlModes`, `supportedFeatures`, `modelRefs`, `probeResultDigests`, and
`denyCanaryReceiptDigests` are ascending UTF-8 strings. Equal complete keys are duplicate and
rejected. The capability-observation objects above, the two observation objects, and every item
listed in these arrays are the complete closed schemas; no implementation-selected member or sort
key participates in a digest.

Two `adapterRows` with the same scalar identity are duplicates and rejected even when their sorted
`controlModes` arrays differ; an implementation cannot use array comparison as a hidden tie-breaker.
Cross-language vectors cover reordered nested modes and the same-identity/different-mode duplicate
rejection.

The `capability_manifest_submission` fact payload contains exactly `challengeId`, `challengeNonce`,
`capabilitySequence`, `capabilityManifest`, `capabilityManifestHash`, `probeResults`,
`bypassCoverageObjects`, `denyCanaryReceipts`, and `enforcerKeyProofSignature`. `probeResults` is
sorted by probe ID and must produce exactly the manifest's sorted `probeResultDigests`; deny-canary
receipts are sorted by `(enforcementAdapterId,canaryId)` and must produce exactly the per-row
`denyCanaryReceiptDigests`. `bypassCoverageObjects` sorts by enforcement-adapter ID and each digest
must equal the corresponding managed-enforcement row. Bodies are signed inside the Semantic Runner
Fact and retained with the immutable observation; digest-only submissions are schema-invalid.

`capabilityAdmission` is a closed object with exactly `capabilityAdmissionId`, `runnerId`,
`enrollmentEpoch`, `challengeId`, `capabilitySequence`, `capabilityManifestHash`,
`effectiveCapabilityDigest`, `assuranceClass`, `allowedAdapterRows`, `effectiveIsolationFeatures`,
`effectiveRepositoryFeatures`, `managedEnforcementAdmissions`, `hardSafeImplementationMaximum`,
`localExecutionEligible`, `cloudExecutionEligible`, `localReviewEligible`, `policyVersion`,
`adapterPolicyVersion`, `adapterAuthorizationVersion`, `decisionReasonCode`, `issuedAt`,
`expiresAt`, and `capabilityAdmissionHash`. Each `allowedAdapterRows[]` item is the closed object
`{ adapterId, adapterKind, adapterVersion, toolKind, toolObservedVersion, controlModes, supportedFeatures, modelRefs, managedEnforcementAdmissionId, managedEnforcementAdmissionDigest }`.
Each `managedEnforcementAdmissions[]` item is exactly
`{ managedEnforcementAdmissionId, enforcementAdapterId, enforcementAdapterBuildDigest, clientKind, clientVersion, enforcementMode, profileRevision, policyRevision, enforcementDecisionKeyId, enforcementDecisionPublicKey, bypassCoverageDigest, denyCanaryReceiptDigests, admissionExpiresAt, managedEnforcementAdmissionDigest }`;
its digest is the standard domain-separated digest of the item without its digest, using
`opzava.runner.managed-enforcement-admission.digest.v1\0`. Its arrays are present/sorted. The
effective digest hashes exactly every field shown in `effectiveCapabilityBody`, not an
implementation-specific projection.

Managed-enforcement trust has a closed server lifecycle separate from the immutable admission
object: `candidate -> active -> quiescing -> superseded|revoked|expired`. At most one admission is
`active` for `(runnerId,enrollmentEpoch,enforcementAdapterId)`. Planned key/build/policy rotation
issues a new capability challenge, repeats key possession plus every server-selected deny canary,
and leaves the resulting admission in `candidate`. Runner Registry then emits the closed
`request_managed_enforcement_quiescence` order. Its payload is exactly
`{ managedEnforcementRotationId, priorManagedEnforcementAdmissionId, candidateManagedEnforcementAdmissionId, enforcementAdapterId, quiescenceNonce, expectedAdmittedDecisionSequence, expectedAdmittedManagedEnvelopeSequenceByProcess, quiesceBy }`.
Each expected process item is exactly `{ processRegistrationId, expectedAdmittedProducerSequence }`,
sorted by process-registration ID and duplicate-free. The decision sequence is scoped to the prior
managed-enforcement admission; managed envelope producer sequences are scoped to each process
registration whose active lease uses that admission. Every sequence is an unsigned-decimal string
and uses `"0"` when none exists.

The Runner CAS-enters `quiescing`, blocks every new managed tool decision or forward, drains each
already reserved forward to a terminal use receipt and its corresponding managed envelope, then
blocks new envelope production for the prior admission and persists a UUID
`managedEnforcementFreezeId`. Previously journaled envelopes remain replayable until their fact
admission is ACKed. The Runner returns a `managed_enforcement_quiescence_report` Semantic Runner
Fact with capability sequence, Runner-Registry source, and `none` workspace/process observations.
Its payload is exactly
`{ capabilitySequence, managedEnforcementRotationId, priorManagedEnforcementAdmissionId, candidateManagedEnforcementAdmissionId, enforcementAdapterId, quiescenceNonce, managedEnforcementFreezeId, expectedAdmittedDecisionSequence, expectedAdmittedManagedEnvelopeSequenceByProcess, finalDecisionSequence, finalManagedEnvelopeSequenceByProcess, quiescedAt, managedEnforcementFreezeDigest }`.
Final process items are exactly `{ processRegistrationId, finalProducerSequence }`, with the same
sort, uniqueness, and membership rules as the expected array. The freeze digest is
`SHA256(UTF8("opzava.runner.managed-enforcement-freeze.digest.v1\0") || RFC8785(reportPayloadWithoutManagedEnforcementFreezeDigest))`.

The report may advance beyond the expected snapshot only for work already reserved before
quiescence; it may never regress or omit an expected process. The same
`(managedEnforcementRotationId,managedEnforcementFreezeDigest)` is idempotent; a changed nonce,
admission/key binding, membership, cursor, or digest under that rotation ID is collision and invokes
containment. One transaction admits the report and performs cutover only after its reported final
decision cursor and every final process cursor equal the server-admitted contiguous cursors, no
forward remains `reserved|forwarding_unknown`, every affected lease still names the prior admission,
and the candidate admission/key is current and unexpired. It activates the new admission and
supersedes the old one with no decision overlap. The server then emits the ordinary signed Fact
Admission ACK; ACK loss replays the stored ACK snapshot and cannot reopen the old key. Failure to
quiesce by `quiesceBy` invalidates the affected capability and invokes loss/containment; it never
permits two active decision keys.

Immediate revocation atomically records `revoked` with reason/effective time, rejects every new or
unadmitted old-key decision, closes the Runner connection, invalidates affected Capability
Admissions, and invokes the owning loss/containment path for active leases. A receipt already
server-admitted before cutover/revocation remains immutable evidence only. Expiry follows the same
admission-invalid path. Reconnect, daemon restart, trust-bundle rotation, or a new manifest cannot
reset this lifecycle or reuse a decision sequence. Conformance covers planned rotation,
changed-key/same-ID, report replay/collision, cursor gap and membership mismatch, ACK loss after
cutover, old-key late receipt, emergency revocation during a tool call, and active-lease
containment.

`manifestBody` contains the sorted probe-result digests, Enforcer public key, and every managed
enforcement row/public key shown in the closed manifest, but neither outer transport/fact signatures
nor any Enforcer or managed-enforcement private key. Its server result order embeds the exact
admission object/hash or rejection reason. Cross-language golden vectors cover every construction;
any unlisted nested member fails.

The same `(runnerId, enrollmentEpoch, capabilitySequence, capabilityManifestHash)` is idempotent. A
reused sequence/challenge with another hash, a sequence gap, stale connection, or unsupported
critical probe is rejected and suspends new admission. A lower sequence is stale evidence. Active
work whose required admission expires or is invalidated enters the owning loss/containment path; it
is never reported stopped merely because capability changed.

## Tool/version/mode policy

The matrix is server-managed and versioned. Rows below are initial policy intent, not a promise that
an unbuilt Adapter already works.

| Harness       | Platform / mode                                                         | Current vendor evidence                                                                                                                                                              | V1 policy                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex CLI     | Local or cloud; managed headless                                        | Installed CLI exposes `exec`, working directory, sandbox, approval policy, JSONL, schema, session persistence/resume                                                                 | Eligible after an approved Adapter proves version, safe sandbox/approval configuration, typed output, session/process control, and stop/checkpoint behavior                                     |
| Claude Code   | Local or cloud; managed headless                                        | Installed CLI exposes print/headless, stream-JSON, session/resume, worktree, tool allow/deny, settings/MCP, and permission modes                                                     | Eligible after an approved Adapter pins tools/settings, external containment, structured output, session/process control, and never uses permission bypass without an approved external sandbox |
| Codex Desktop | Supported desktop OS; human-interactive or documented control mode only | Availability and control surfaces vary by OS/version; this Linux host has Codex CLI, not a desktop app. Experimental Codex app-server/remote-control flags are not stable authority. | Show as unavailable on unsupported OS. Managed autonomous mode stays conditional until a supported, version-pinned, non-UI-automation Adapter exists.                                           |

Rules common to all:

- installed capability inventory and selected default tool are different fields;
- the user explicitly selects a supported tool and enabled control mode; Opzava never assumes a
  desktop client exists on Linux;
- supported modes are `manual_command_client`, `managed_ordinary`, and `managed_autonomous_serial`;
  only a capability explicitly advertised and policy-approved can be selected;
- a manual MCP session can request a claim but cannot forge the Runner's start receipt;
- vendor session IDs are opaque correlation refs. They are not lease IDs, approval, or continuity
  proof;
- vendor auto-fallback, resume, hooks, or internal worktree features do not replace Opzava's exact
  Runner journal, fence, worktree generation, or Lease Enforcer;
- dangerous vendor bypass flags are denied unless the exact Adapter policy proves an externally
  isolated sandbox and the Human Owner/tenant policy permits that mode;
- missing interactive permission produces a structured `human_input_required`/`policy_denied`
  outcome and a governed Opzava stop. The Runner never waits forever on a hidden prompt.

## Signed wire contract

### Canonical bytes and signatures

V1 has one wire representation:

- frames are UTF-8 I-JSON objects; RFC 8785 produces all signed/pre-hash bytes;
- field names and enum values are exact case-sensitive ASCII. Every v1 signed-object schema is
  closed: **every unknown field fails**, not only a caller-labelled "critical" field. A future minor
  version may add an explicitly negotiated `extensions` object; v1 has no such field;
- optional fields are omitted when absent—`null` never means absent—and arrays that are part of a
  signed-object schema are present even when empty;
- SHA-256 values are lowercase `sha256:<64 hex digits>` strings; Ed25519 public keys, signatures,
  and 256-bit nonces are RFC 4648 §5 base64url **without** `=` padding;
- UUID identifiers use lowercase canonical hyphenated text. Every integer that crosses a signed or
  hashed v1 boundary—including epochs, versions, sequences, cursors, byte counts, use counts,
  durations, ports, drift values, and monotonic counters—is a JSON **string** containing a canonical
  unsigned decimal integer in `0..18446744073709551615`, with no leading zero except `"0"`; a
  field's narrower closed range still applies. Signed/hashed v1 objects contain no JSON-number
  token, so RFC 8785/JavaScript precision cannot change an integer before verification;
- instants use UTC RFC 3339 with exactly millisecond precision (`YYYY-MM-DDTHH:mm:ss.SSSZ`), and
  durations/deadlines use the unsigned-decimal millisecond strings above or the explicitly named
  monotonic-counter string—not a locale string, JSON number, or floating-point number;
- a Runner Delivery Envelope embeds the Semantic Runner Order as the `semanticOrder` JSON object,
  not JSON-in-a-string, base64 bytes, or an artifact reference. The receiver canonicalizes that
  object, verifies its semantic signature/hash, and equality-checks the envelope's
  `semanticCommandHash` before journaling or ACK.

Any alternate padding, uppercase/missing digest prefix, explicit-null optional, unsafe numeric
encoding, timestamp precision, or embedded-order representation is noncanonical and rejected rather
than normalized before signature verification.

V1 has one non-negotiable parser profile, `runner-v1-limits`: WSS text frame and any Runner
transport/delivery/trust-update/fact-admission-ACK frame `<=1,048,576` UTF-8 bytes; Semantic Runner
Order `<=262,144`; Semantic Runner Fact `<=524,288`; each
connection/enrollment/rotation/recovery/time ceremony object and Lease Secret Broker IPC object
`<=65,536`; JSON nesting depth `<=32`; object members `<=256`; any UTF-8 string `<=65,536`; feature
arrays `<=32`; handle/artifact/skill/MCP refs `<=256`; and any reconciliation inventory array
`<=2,048`. Counts apply to received uncompressed bytes before parsing; compression and
fragmented-message aggregation beyond the frame limit are forbidden. Raw bundle/artifact/log/diff
bytes are never inline and use their separately bounded ingress. A peer exceeding any limit is
rejected before canonicalization/signature work with `malformed`; limits cannot be increased by a
hello feature, tenant field, or implementation default.

The shared v1 enum registry is closed. `retryClass` is `terminal`, `retry_after_reauthorize`,
`retry_after_health`, or `retry_after_human`. `safeReasonCode`/`reasonCode` is one of `none`,
`expired`, `revoked`, `malformed`, `unsupported_version`, `unsupported_capability`,
`enforcer_key_not_admitted`, `stale_epoch`, `stale_fence`, `sequence_gap`, `sequence_collision`,
`nonce_replay`, `policy_denied`, `capability_unavailable`, `human_input_required`,
`process_unknown`, `grant_failed`, `containment_failed`, `provider_unhealthy`, or
`internal_unavailable`. `capabilityState` is `available`, `unavailable`, or `unknown`;
`assuranceClass` is `verified_adapter`, `self_reported`, or `unsupported_or_unverifiable`;
`resourceKind` is `process`, `worktree`, `container`, `port`, `grant`, or `preview`; resource
`disposition` is `active`, `removed`, `stopped`, `quarantined`, or `unknown`;
`containmentDisposition` is `stopped`, `quarantined`, or `unknown`; `localDisposition` is `removed`,
`not_found`, or `removal_failed`. `probeKind` is `runner_build`, `adapter_build`, `tool_version`,
`managed_enforcement`, `enforcer_key`, `containment`, `repository`, `docker_review`,
`preview_transport`, or `secret_broker`; `subjectKind` is `runner`, `adapter`, `tool`,
`managed_enforcement_adapter`, `enforcer`, `repository`, `docker`, `preview`, or `secret_broker`;
`resultCode` is `pass`, `fail`, `unknown`, or `unsupported`. Execution modes are exactly
`manual_command_client`, `managed_ordinary`, or `managed_autonomous_serial`; secret grant classes
are `local_only` or `cloud_eligible`. Family-specific Adapter kinds are `codex_cli_adapter`,
`claude_code_adapter`, or `codex_desktop_adapter`; tool kinds are `codex_cli`, `claude_code`, or
`codex_desktop`. `supportedProtocols`, `allowedProtocols`, and `selectedProtocol` use only the
canonical string `"1"` in v1. Transport `supportedFeatures`, `allowedFeatures`, and
`selectedFeatures` use only `semantic_fact_v1`, `capability_challenge_v1`, `reconciliation_v1`,
`time_anchor_v1`, `enforcer_outcome_v1`, `secret_broker_v1`, `exact_ref_handoff_v1`, or
`artifact_ref_v1`. `selectedFeatures` is the sorted exact intersection of Runner support and current
server policy; it cannot contain a value absent from either input, and it must contain every
challenge `requiredFeatures` literal. V1 `requiredFeatures` is the sorted exact array
`["artifact_ref_v1","capability_challenge_v1","enforcer_outcome_v1","reconciliation_v1","semantic_fact_v1","time_anchor_v1"]`.
The other two features are optional and may be required by current tenant policy.
Capability-manifest `isolationFeatures` use only `os_supervised_enforcer`, `process_group`,
`cgroup_v2`, `systemd_scope`, `container_scope`, `network_quarantine`, `ptrace_denied`,
`proc_cross_read_denied`, or `secret_broker_namespace`. `repositoryFeatures` use only
`git_worktree`, `git_common_dir_identity`, `realpath_confinement`, `symlink_escape_denial`,
`branch_ref_lock`, `dirty_state_digest`, or `object_bundle_export`. Adapter-row `supportedFeatures`
use only `structured_events`, `session_resume`, `typed_output`, `managed_process_stop`,
`bounded_checkpoint`, `explicit_tool_policy`, `explicit_mcp_policy`, or `model_selection`. All
feature arrays are present, sorted, duplicate-free arrays of strings. These feature families are
distinct; a literal from one family is invalid in another.

Feature gates are exact: `semantic_fact_v1` is required for every persistent fact;
`capability_challenge_v1` for capability challenge/submission/result orders; `reconciliation_v1` for
reconciliation orders/facts; `time_anchor_v1` for `connection_ready` and every Current connection;
`enforcer_outcome_v1` for Enforcer orders/outcomes; and `artifact_ref_v1` for checkpoint,
managed-output, object-bundle, and other artifact references. `secret_broker_v1` is additionally
required before any secret-grant order/capability/operation. `exact_ref_handoff_v1` plus
`artifact_ref_v1` are required before object-bundle upload or exact-ref publication. A missing gate
rejects the affected order before delivery; it never silently downgrades the message.
Diagnostics-only connections still require all six core features so their replay, reconciliation,
and security semantics are deterministic.

Family-specific enums explicitly listed below refine, but never extend, this registry. A new literal
requires a negotiated protocol version; accepting an unknown literal is forbidden.

Every post-connection Runner-to-server transport frame uses one exact current-connection
digest/signature:

```text
runnerFrameBody = frame_without(frameDigest, runnerSignature)
frameDigest = SHA256(
  UTF8("opzava.runner.frame.digest.v1\0") || RFC8785(runnerFrameBody)
)
runnerSignature = Ed25519.sign(
  authorizedRunnerEnrollmentKey,
  UTF8("opzava.runner.frame.signature.v1\0") ||
    RFC8785(frame_with_frameDigest_without_runnerSignature)
)
```

The outer frame carries `keyId`, `connectionEpoch`, and negotiated transcript hash, but the server
chooses the allowed algorithm from the key authorization/protocol version; a caller cannot downgrade
it. A persistent capability, execution, or reconciliation observation is a separately signed
**Semantic Runner Fact** embedded as an object in that outer frame. Its identity deliberately
contains no connection epoch or transcript, so the exact fact can be replayed after reconnect inside
a newly signed current-connection frame:

```text
runnerFactBody = runnerFact_without(factDigest, factSignature)
factDigest = SHA256(
  UTF8("opzava.runner.semantic-fact.digest.v1\0") || RFC8785(runnerFactBody)
)
factSignature = Ed25519.sign(
  factSigningKey_selected_by(signerBinding),
  UTF8("opzava.runner.semantic-fact.signature.v1\0") ||
    RFC8785(runnerFact_with_factDigest_without_factSignature)
)
```

The outer transport frame proves a current authenticated path; the inner fact proves immutable
ordered content. Ordinary facts use the named Runner enrollment key. Authority-reducing autonomous
facts use the registered Enforcer outcome key for the original lease/enrollment and remain
admissible after Runner-key revocation/recovery only for their closed autonomous fact kinds. The
server rejects an old-epoch outer frame, but it may admit an unchanged inner fact when its signer is
authorized by those rules and its sequence is above the server's communicated contiguous cursor.
Reframing changes only `frameDigest`; it never changes `factDigest`. Key rotation cannot cut over
until every ordinary old-key fact is admitted contiguously. The connection proof/accepted/ready
signatures use their specialized constructions above. Every digest below names its own
domain-separated preimage. No construction contains **its own** digest or signature field; an outer
construction includes an embedded already-signed inner object in full, including that inner object's
digest/signature, so equality remains end-to-end.

Semantic orders and delivery envelopes use these exact constructions:

```text
semanticBody = order_without(semanticCommandHash, semanticSignature)
semanticCommandHash = SHA256(
  UTF8("opzava.runner.semantic-order.digest.v1\0") || RFC8785(semanticBody)
)
semanticSignature = Ed25519.sign(
  serverSemanticKey,
  UTF8("opzava.runner.semantic-order.signature.v1\0") ||
    RFC8785(order_with_semanticCommandHash_without_semanticSignature)
)

envelopeBody = envelope_without(envelopeHash, envelopeSignature)
envelopeHash = SHA256(
  UTF8("opzava.runner.delivery-envelope.digest.v1\0") || RFC8785(envelopeBody)
)
envelopeSignature = Ed25519.sign(
  serverEnvelopeKey,
  UTF8("opzava.runner.delivery-envelope.signature.v1\0") ||
    RFC8785(envelope_with_envelopeHash_without_envelopeSignature)
)
```

`envelopeBody.semanticOrder` contains the exact signed Semantic Runner Order as the embedded JSON
object, and `envelopeBody.semanticCommandHash` must equal the verified hash of that object. No byte
string, base64 encoding, artifact reference, or content-addressed alternative is allowed. Equality
is verified before ACK. RFC 8785 is applied to the parsed I-JSON object, encoded as UTF-8 exactly
once. Field removal occurs on the typed object before canonicalization, never by string surgery. The
implementation publishes language-independent byte/hex fixtures so Node and every supported Runner
implementation must produce identical canonical bytes, digests, signatures, and verification
outcomes.

The implementation publishes golden vectors and rejects:

- duplicate JSON keys, non-I-JSON numbers, invalid Unicode, noncanonical encodings, any unknown
  field, unsupported major versions, forbidden compression, and oversized frames;
- wrong domain, direction, role, key, enrollment epoch, connection epoch, enrollment-derived target,
  protocol feature, signature, hash, nonce, lease/fence, capability/policy digest, or repository
  binding;
- frames received after key/enrollment/connection revocation or expiry.

### Server-to-Runner Command Delivery

A **Semantic Runner Order** is persisted before network send. Its signed canonical bytes and
`semanticCommandHash` never change across retry or reconnect. Its closed top-level schema has
exactly these required fields: `protocolVersion`, `messageKind="runner.semantic_order"`,
`commandId`, `runnerId`, `enrollmentEpoch`, `serverCommandKeyId`, `issuedAt`, `expiresAt`,
`commandKind`, `authorityBinding`, `workspaceBinding`, `capabilityBinding`, `secretGrantHandles`,
`previewGrantHandles`, `humanInputPolicyBinding`, `payload`, `semanticCommandHash`, and
`semanticSignature`. The two handle arrays are always present, sorted, and empty when unused.

`expiresAt` is an action deadline, not merely a server-side receipt filter. Before journaling an
action disposition and again immediately before every authority-creating, external, or
evidence-producing local step (registration, grant activation/use, Enforcer arm/renew, spawn,
checkpoint/artifact creation, grant/preview mutation, artifact upload, or publication handoff), the
Runner computes the conservative server-time upper bound from its current signed time anchor and
requires it to be strictly earlier than both `expiresAt` and any narrower payload deadline. An
expired order is journaled as no-action and returns
`transport_ack.ackDisposition="journaled_rejected"` with safe reason `expired`; no Adapter, Broker,
process, filesystem, grant, preview, or artifact action may begin. An expired
`fence_lease_enforcer`, `checkpoint_and_stop_or_quarantine`, `revoke_local_grant`, or
`close_preview_delivery` likewise cannot be treated as current command authority; however, expiry or
a missing anchor is itself loss of verifiable authority, so the independent Lease Enforcer uses its
already accepted `autonomousContainmentId` to stop/quarantine and dispose/close resources under the
closed authority-reducing fact contract. It never continues merely because the reducing order
expired. If expiry races an already begun non-atomic operation, the Runner stops further effects and
enters the owning containment/reconciliation path; a late Runner Receipt cannot make the action
authoritative. Exact redelivery returns the original rejection. Registry-only orders use the same
check with the current signed connection time anchor; without a valid anchor, action fails closed.
The sole narrow exception is the first-enrollment `capability_manifest_challenge` and its one
`capability_manifest_submission` while the epoch is `DiagnosticsBootstrap`: the server evaluates
that challenge's expiry by trusted receive time as defined above. No result order or other
Registry/action command shares this exception.

The closed binding unions are:

- `authorityBinding={ kind:"runner_registry", registryAuthorityId, registryAuthorityVersion, actionNonce }`;
  or
- `authorityBinding={ kind:"execution", leaseId, fenceToken, claimAttemptId, devTicketId, readyContractVersion, readyContractHash, executionBindingRef, commandNonce, purpose }`.
- `workspaceBinding={ kind:"none" }`; or
  `{ kind:"execution_workspace", repositoryId, worktreeGeneration, canonicalWorktreePathHash, branchRef, expectedHeadSha, continuationBinding, processRegistrationId, processRegistrationVersion, launchAttemptId }`.
  A pre-registration order uses the reserved registration/version and launch attempt; it never omits
  identity.
- `capabilityBinding={ kind:"none" }`; or the closed execution-capability object
  `{ kind:"execution_capability", capabilityAdmissionId, capabilityManifestHash, effectiveCapabilityDigest, adapterPolicyVersion, adapterAuthorizationVersion, harnessAdapterKind, harnessAdapterVersion, toolKind, toolObservedVersion, controlMode, managedEnforcementAdmissionId, managedEnforcementAdmissionDigest }`;
  when a model is selected, that exact object additionally contains required `modelRef`. These are
  the only two execution-capability variants; `modelRef` is omitted, never null, in the first.
- `humanInputPolicyBinding={ kind:"none" }`; or
  `{ kind:"governed_input", inputPolicyVersion, allowedSafeInputSchemaRefs, maxRequestedExpiryAt, secureActionPolicyVersion }`.
  The schema-ref array is sorted and duplicate-free; every ref comes from the exact Ready Contract.

Registry orders require `workspaceBinding`, `capabilityBinding`, and `humanInputPolicyBinding` all
be `none` plus empty handle arrays. Execution orders require both execution workspace/capability
bindings; their human-input binding is `governed_input` only when the exact Ready Contract permits
one of its listed schemas, otherwise `none`. A command that does not use a grant still carries empty
arrays. Every nested object is closed. Execution `authorityBinding.purpose` is exactly the selected
execution `commandKind`: `prepare_execution_registration`, `activate_secret_grants`,
`arm_lease_enforcer`, `renew_lease_enforcer`, `fence_lease_enforcer`, `start_execution`,
`checkpoint_execution`, `checkpoint_and_stop_or_quarantine`, `revoke_local_grant`,
`close_preview_delivery`, or `prepare_object_bundle_upload`, or `prepare_exact_ref_publication`. A
mismatch rejects the order before journaling. `payload` is a closed union selected only by
`commandKind`; its exact required member names are:

| `commandKind`                            | Exact `payload` members                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capability_manifest_challenge`          | `challengeId`, `challengeNonce`, `expectedKeyId`, `expectedConnectionEpoch`, `expectedBootIncarnation`, `requiredProbeSchemaVersion`, `policyVersion`, `probeSpecifications`, `probeSpecificationsDigest`, `managedEnforcementCanaries`, `managedEnforcementCanariesDigest`, `priorCapabilitySequence`, `priorCapabilityManifestHash`, `challengeExpiresAt` |
| `capability_manifest_admitted`           | `challengeId`, `capabilitySequence`, `capabilityManifestHash`, `capabilityAdmission`, `capabilityAdmissionHash`                                                                                                                                                                                                                                             |
| `capability_manifest_rejected`           | `challengeId`, `capabilitySequence`, `capabilityManifestHash`, `reasonCode`, `retryClass`                                                                                                                                                                                                                                                                   |
| `request_managed_enforcement_quiescence` | `managedEnforcementRotationId`, `priorManagedEnforcementAdmissionId`, `candidateManagedEnforcementAdmissionId`, `enforcementAdapterId`, `quiescenceNonce`, `expectedAdmittedDecisionSequence`, `expectedAdmittedManagedEnvelopeSequenceByProcess`, `quiesceBy`                                                                                              |
| `prepare_execution_registration`         | `processRegistrationId`, `processRegistrationVersion`, `launchAttemptId`, `adapterPlan`, `adapterPlanDigest`, `namedSecretReservations`, `namedSecretReservationDigest`, `containmentReservationId`, `containmentPolicyVersion`, `resourceReservations`                                                                                                     |
| `activate_secret_grants`                 | `processRegistrationId`, `processRegistrationVersion`, `launchAttemptId`, `grantSetDigest`, `activationPolicyVersion`                                                                                                                                                                                                                                       |
| `arm_lease_enforcer`                     | `enforcerAuthoritySequence`, `enforcerAuthorityNonce`, `autonomousContainmentId`, `containmentHandleDigest`, `authorityIssuedAt`, `authorityNotAfter`, `authorityDurationMs`, `timeAnchorId`, `timePolicyVersion`, `commandTrustBundleVersion`                                                                                                              |
| `renew_lease_enforcer`                   | `enforcerAuthoritySequence`, `enforcerAuthorityNonce`, `previousAuthorityOrderHash`, `authorityIssuedAt`, `authorityNotAfter`, `authorityDurationMs`, `timeAnchorId`, `timePolicyVersion`, `commandTrustBundleVersion`                                                                                                                                      |
| `fence_lease_enforcer`                   | `enforcerAuthoritySequence`, `enforcerAuthorityNonce`, `previousAuthorityOrderHash`, `containmentRequestId`, `containmentReasonCode`, `terminalFence`                                                                                                                                                                                                       |
| `start_execution`                        | `processRegistrationId`, `processRegistrationVersion`, `launchAttemptId`, `registrationFactDigest`, `enforcerArmedFactDigest`, `secretActivationFactDigests`, `adapterPlanDigest`                                                                                                                                                                           |
| `checkpoint_execution`                   | `checkpointRequestId`, `checkpointSchemaVersion`, `artifactPolicyVersion`, `deadlineAt`                                                                                                                                                                                                                                                                     |
| `checkpoint_and_stop_or_quarantine`      | `containmentRequestId`, `checkpointSchemaVersion`, `containmentReasonCode`, `stopDeadlineAt`, `quarantinePolicyVersion`                                                                                                                                                                                                                                     |
| `revoke_local_grant`                     | `grantDispositionRequestId`, `grantHandleIds`, `reasonCode`, `deadlineAt`                                                                                                                                                                                                                                                                                   |
| `close_preview_delivery`                 | `previewDispositionRequestId`, `previewDeliveryIds`, `reasonCode`, `deadlineAt`                                                                                                                                                                                                                                                                             |
| `prepare_object_bundle_upload`           | `artifactAdmissionId`, `uploadNonce`, `publicationPreparationId`, `publicationNonce`, `exactRef`, `expectedOldSha`, `proposedNewSha`, `proposedTreeSha`, `objectManifestDigest`, `maxBundleBytes`, `scanPolicyVersion`, `uploadExpiresAt`                                                                                                                   |
| `prepare_exact_ref_publication`          | `publicationPreparationId`, `publicationNonce`, `exactRef`, `expectedOldSha`, `proposedNewSha`, `proposedTreeSha`, `objectManifestDigest`, `objectBundleDigest`, `objectBundleArtifactRef`, `publicationPolicyVersion`, `preparationExpiresAt`                                                                                                              |
| `request_reconciliation_observation`     | `reconciliationObservationId`, `inventorySchemaVersion`, `expectedExecutionFactSequenceByLease`, `expectedAutonomousFactSequenceByLease`, `expectedCapabilityFactSequence`, `expectedReconciliationFactSequence`, `observationDeadlineAt`                                                                                                                   |

The command-to-fact relation is also closed. `journaled_rejected` before any local action produces
no persistent fact for any row. Otherwise the exact permitted primary facts and cardinality are:

| `commandKind`                            | Permitted persistent fact result                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capability_manifest_challenge`          | Exactly one `capability_manifest_submission`; on first enrollment it is the sole fact permitted in `DiagnosticsBootstrap`.                                                                                                                                                                                                       |
| `capability_manifest_admitted`           | None; this is a terminal Registry notification acknowledged only by transport ACK.                                                                                                                                                                                                                                               |
| `capability_manifest_rejected`           | None; this is a terminal Registry notification acknowledged only by transport ACK.                                                                                                                                                                                                                                               |
| `request_managed_enforcement_quiescence` | Exactly one `managed_enforcement_quiescence_report`.                                                                                                                                                                                                                                                                             |
| `prepare_execution_registration`         | Exactly one `process_registration_reserved` or `command_rejected_no_action`; a governed pre-action block may instead return exactly one `human_input_required` or `policy_denied`.                                                                                                                                               |
| `activate_secret_grants`                 | Exactly one `secret_grants_activated` or `secret_grant_activation_failed`; a governed pre-action block may instead return exactly one `human_input_required` or `policy_denied`.                                                                                                                                                 |
| `arm_lease_enforcer`                     | Exactly one `lease_enforcer_armed`; a governed pre-action block may instead return exactly one `human_input_required` or `policy_denied`.                                                                                                                                                                                        |
| `renew_lease_enforcer`                   | Exactly one `lease_enforcer_renewed`; failure to accept/renew creates no substitute command fact and invokes autonomous containment under the last accepted authority.                                                                                                                                                           |
| `fence_lease_enforcer`                   | Exactly one `lease_enforcer_fenced`; further cleanup facts require the separately delivered containment/disposition orders or the autonomous source.                                                                                                                                                                             |
| `start_execution`                        | Exactly one `execution_started` or `command_rejected_no_action`; a governed pre-spawn block may instead return exactly one `human_input_required` or `policy_denied`. After `execution_started`, zero or more `managed_harness_envelope`, governed `human_input_required`, or `policy_denied` runtime facts may use this source. |
| `checkpoint_execution`                   | Exactly one `checkpoint_recorded` or `checkpoint_not_recorded`; a governed pre-action block may instead return exactly one `human_input_required` or `policy_denied`.                                                                                                                                                            |
| `checkpoint_and_stop_or_quarantine`      | In order: exactly one `checkpoint_recorded` or `checkpoint_not_recorded`; then one `local_grant_disposition_observed` iff grant handles are nonempty; then one `preview_delivery_closed` iff preview handles are nonempty; then exactly one `containment_confirmed` or `containment_incomplete`.                                 |
| `revoke_local_grant`                     | Exactly one `local_grant_disposition_observed`.                                                                                                                                                                                                                                                                                  |
| `close_preview_delivery`                 | Exactly one `preview_delivery_closed`.                                                                                                                                                                                                                                                                                           |
| `prepare_object_bundle_upload`           | No Semantic Runner Fact; the separately bounded signed artifact-ingress response is the only upload result. A governed pre-action block may instead return exactly one `human_input_required` or `policy_denied`.                                                                                                                |
| `prepare_exact_ref_publication`          | Exactly one `exact_ref_publication_submission`; a governed pre-action block may instead return exactly one `human_input_required` or `policy_denied`.                                                                                                                                                                            |
| `request_reconciliation_observation`     | Exactly one `reconciliation_observation`.                                                                                                                                                                                                                                                                                        |

As a pre-action replacement, `human_input_required` is legal only when the order carries a
`governed_input` binding for that exact Ready-approved phase. `policy_denied` must bind the current
server-selected policy version and exact command phase even when human input is not enabled. A
replacement occurs before the primary effect and cannot be combined with a primary fact. After an
accepted start, runtime Human/policy facts bind that same start source, use `spawnState="working"`
until the process state changes, and create Blocked/containment input only; they never grant the
requested action. Their `commandPhase` is exactly `before_registration`, `before_spawn`, or
`managed_runtime`; the selected phase, observations, and proof digest must match the command row and
occur before any effect claimed absent. Human/policy facts are forbidden for Registry notification,
renew, fence, containment, revoke, close, and reconciliation rows. A managed-harness fact after
start is ongoing process output, not a second start result. The seven autonomous authority-reducing
fact kinds are not responses to a delivered command and may use only the autonomous source contract
below. Any other `commandKind`/`factKind`, wrong multiplicity/order, or second terminal result is
rejected before fact ACK or workflow mutation.

`request_managed_enforcement_quiescence` may produce only `managed_enforcement_quiescence_report`;
its rotation/admission/adapter/nonce/expected-cursor fields must equal the originating order
byte-for-byte. A report under any other command kind, a quiescence order answered by any other
persistent fact, or a changed report under the same rotation ID is rejected before lifecycle
mutation.

For `checkpoint_and_stop_or_quarantine`, the checkpoint stage has one bounded attempt and terminates
with exactly one of the two checkpoint outcomes. `checkpoint_not_recorded` satisfies ordering only
as evidence of the failed/unavailable/deadline-exceeded attempt: the Runner must still perform every
applicable grant and preview cleanup step and then emit the terminal containment outcome. It cannot
retry checkpointing indefinitely or use checkpoint failure to omit containment.

All arrays in this table are present, sorted by their canonical ID, and duplicate-free. A digest
member is a lowercase SHA-256 value under the named object's construction; a reason or retry member
is a versioned enum, never free text. On the first capability challenge,
`priorCapabilitySequence="0"` and `priorCapabilityManifestHash` is the fixed value
`SHA256(UTF8("opzava.runner.no-prior-capability.v1\0"))`; it is never null or omitted. Fields not
shown for the selected row are forbidden. `expectedExecutionFactSequenceByLease[]` items are exactly
`{ leaseId, expectedReceiptSequence }`; `expectedAutonomousFactSequenceByLease[]` items are exactly
`{ leaseId, enforcerKeyId, expectedEnforcerFactSequence }`, sorted by `(leaseId,enforcerKeyId)`;
`grantHandleIds`, `previewDeliveryIds`, and the two top-level handle arrays contain opaque UUIDs
only. A reconciliation observation must equality-match both expected arrays and cannot omit a lease
or Enforcer key that appears in the request/server cursor set.

`continuationBinding` is exactly `{ kind:"fresh" }` or
`{ kind:"adopted", checkpointId, checkpointLineageHash, lastServerConfirmedReceiptSequence }`.
Adoption is valid only when WF-230 has released prior containment and the server selected those
values from its admitted checkpoint/inbox state; the Runner cannot propose them.

`adapterPlan` is exactly
`{ adapterPlanSchemaVersion, harnessAdapterKind, harnessAdapterVersion, toolKind, toolObservedVersion, controlMode, modelBinding, toolPolicyRef, mcpPolicyRef, skillPolicyRef, outputPolicyVersion }`.
`modelBinding` is `{ kind:"none" }` or `{ kind:"selected", modelRef }`; policy refs are opaque
server-owned version refs. `adapterPlanDigest` is
`SHA256(UTF8("opzava.runner.adapter-plan.digest.v1\0") || RFC8785(adapterPlan))`. Each
`namedSecretReservations[]` item is exactly
`{ reservationId, namedSecretRef, namedSecretVersion, purposeId, grantClass }`, sorted by
reservation ID, and contains no value. `namedSecretReservationDigest` is the domain-separated digest
of that exact array under `opzava.runner.named-secret-reservations.digest.v1\0`.

The later activation order binds broker-issued handles without exposing values. Each
`requiredGrantBindings[]` item is exactly
`{ grantHandleId, reservationId, namedSecretRef, namedSecretVersion, purposeId, grantClass }`,
sorted by grant-handle ID. Its exact preimage is
`grantSetBody={ processRegistrationId, processRegistrationVersion, launchAttemptId, requiredGrantBindings }`,
and
`grantSetDigest=SHA256(UTF8("opzava.runner.secret-grant-set.digest.v1\0") || RFC8785(grantSetBody))`.
For a zero-grant claim, `requiredGrantBindings=[]` is present; the other three registration
identities remain exact, so the empty set is canonical without becoming reusable across
registrations.

Each `resourceReservations[]` item is exactly one of
`{ kind:"port", resourceReservationId, portPurposeId, bindingPolicyId }`,
`{ kind:"container", resourceReservationId, containerPurposeId, isolationPolicyId }`, or
`{ kind:"preview", resourceReservationId, previewPurposeId, transportPolicyId }`, sorted by
resource-reservation ID. Each `realizedResourceReservations[]` item repeats its reservation ID and
is exactly `{ kind:"port", resourceReservationId, resourceId, boundPort, loopbackOnly:true }`,
`{ kind:"container", resourceReservationId, resourceId, containerIdentityDigest }`, or
`{ kind:"preview", resourceReservationId, resourceId, previewIdentityDigest }`, sorted by
resource-reservation ID. `boundPort` is a canonical unsigned decimal string in `1..65535`; no public
binding is valid. The registration fact's adapter plan, plan digest, named-secret digest,
continuation binding, containment reservation, and realized reservation IDs must equal the order.
Missing, extra, or changed reservations reject the fact before any grant is activated.

Each network attempt wraps that immutable order in a separately signed **Runner Delivery Envelope**.
Its closed schema has exactly `protocolVersion`, `messageKind="runner.delivery_envelope"`,
`deliveryAttemptId`, `deliveryId`, `commandId`, `semanticCommandHash`, `runnerId`,
`enrollmentEpoch`, `connectionEpoch`, `transcriptHash`, `selectedTransportProtocol`,
`selectedFeatures`, `outboxCursor`, `sentAt`, `serverEnvelopeKeyId`, `semanticOrder`,
`envelopeHash`, and `envelopeSignature`. One `deliveryId` maps one-to-one to exactly one
`(commandId, semanticCommandHash)` for its lifetime. Reconnect creates a new attempt/envelope for
the current connection but carries that same delivery mapping and identical semantic object/hash.
The Runner verifies both signatures and equality bindings before journaling the semantic command.
Its ACK identifies the attempt/envelope hash and semantic command hash; it cannot mutate or
acknowledge a different command. Duplicate semantic commands return the original action disposition
even when their delivery envelopes differ.

Permitted order families are `capability_manifest_challenge`, `capability_manifest_admitted`,
`capability_manifest_rejected`, `request_managed_enforcement_quiescence`,
`prepare_execution_registration`, `activate_secret_grants`, `arm_lease_enforcer`,
`renew_lease_enforcer`, `fence_lease_enforcer`, `start_execution`, `checkpoint_execution`,
`checkpoint_and_stop_or_quarantine`, `revoke_local_grant`, `close_preview_delivery`,
`prepare_object_bundle_upload`, `prepare_exact_ref_publication`, and
`request_reconciliation_observation`. Review-specific orders are added only by #229 behind its
authority.

### Server command-key trust

Runner enrollment returns a versioned **Server Command Trust Bundle** over the authenticated setup
channel. The bundle pins an Opzava Runner command root and separately purpose-authorized
Registry-ceremony, connection-acceptance, time-anchor, semantic-order, delivery-envelope, fact-
admission, and connection-control public keys with key ID, algorithm, activation/retirement
interval, and trust-bundle version. The Runner stores only public material and refuses a command key
not authorized for that exact purpose.

The bundle chain is scoped to one `(runnerId, enrollmentEpoch)` and starts at version 1 for every
new enrollment epoch. The bundle is a closed I-JSON object with exactly `protocolVersion`,
`messageKind="runner.server_command_trust_bundle"`, `runnerId`, `enrollmentEpoch`, `bundleVersion`,
`rootEpoch`, `rootKeyId`, `previousBundleHash`, `issuedAt`, `activatesAt`, `expiresAt`,
`authorizedKeys`, `revokedKeys`, `nextRoot`, `trustBundleHash`, and `rootSignature`. Each
`authorizedKeys[]` item is exactly
`{ keyId, algorithm:"Ed25519", purpose, publicKey, activatesAt, retiresAt }`; each `revokedKeys[]`
item is exactly `{ keyId, effectiveAt, reasonCode }`. `nextRoot` is exactly `{ kind:"none" }` or
`{ kind:"scheduled", rootEpoch, rootKeyId, algorithm:"Ed25519", publicKey, cutoverAt }`. Arrays are
sorted by key ID and duplicate-free. Bundle version 1 uses the fixed
`SHA256(UTF8("opzava.runner.no-prior-trust-bundle.v1\0"))` as `previousBundleHash`; it is never null
or omitted. It uses this exact construction:

The first trust bundle for enrollment epoch 1 is accepted only inside an **Initial Server Command
Trust Bootstrap** returned by the local or cloud enrollment-completion response. That bootstrap is a
closed object with exactly `protocolVersion`,
`messageKind="runner.initial_command_trust_bootstrap"`, `runnerId`, `enrollmentEpoch`,
`runnerKeyId`, `runnerPublicKeyFingerprint`, `enrollmentCompletionProofHash`, `rootEpoch`,
`rootKeyId`, `rootAlgorithm="Ed25519"`, `rootPublicKey`, `rootFingerprint`, `trustBundle`,
`bootstrapTranscriptHash`, and `bootstrapRootPossessionSignature`. `enrollmentCompletionProofHash`
is
`SHA256(UTF8("opzava.runner.local-enrollment-completion.digest.v1\0") || RFC8785(localCompletionRequest))`
or
`SHA256(UTF8("opzava.runner.cloud-enrollment-completion.digest.v1\0") || RFC8785(cloudCompletionRequest))`
for the selected ceremony. `runnerPublicKeyFingerprint` is
`SHA256(UTF8("opzava.runner.enrollment-key-fingerprint.v1\0") || decodedRunnerPublicKeyBytes)`.
`rootFingerprint` is
`SHA256(UTF8("opzava.runner.command-root-fingerprint.v1\0") || decodedRootPublicKeyBytes)`. The
transcript and proof are:

```text
bootstrapTranscriptBody = {
  runnerId, enrollmentEpoch, runnerKeyId, runnerPublicKeyFingerprint,
  enrollmentCompletionProofHash, rootEpoch, rootKeyId, rootAlgorithm,
  rootPublicKey, rootFingerprint, trustBundleHash
}
bootstrapTranscriptHash = SHA256(
  UTF8("opzava.runner.initial-command-trust-bootstrap.digest.v1\0") ||
    RFC8785(bootstrapTranscriptBody)
)
bootstrapRootPossessionSignature = Ed25519.sign(
  initialCommandRootPrivateKey,
  UTF8("opzava.runner.initial-command-trust-bootstrap.signature.v1\0") ||
    RFC8785(bootstrap_with_hash_without_bootstrapRootPossessionSignature)
)
```

The Runner accepts the first root only when the bootstrap arrives on the same authenticated,
unexpired enrollment-completion channel; every Runner/enrollment/key/proof field equals the
committed enrollment; the included bundle is version 1; its root identity equals the bootstrap; its
Runner/enrollment scope equals the bootstrap; its hash/signature verifies under `rootPublicKey`; and
both fingerprints are subsequently confirmed in secure UI before Active. The Runner persists the
root public key, fingerprint, root epoch, bundle, and highest bundle version for that
enrollment-epoch chain atomically before acknowledging setup. A copied bootstrap on another
enrollment, transcript mismatch, same key ID with changed bytes, missing Admin/Platform Admin
fingerprint confirmation, or a response that is neither the original completion nor an exact replay
of its consumed `(grantId, challengeId, clientNonce, proofHash)` over an authenticated
completion-replay channel fails closed. This admits response-loss recovery after server commit
without widening the transcript. Subsequent bundles verify only under the already pinned root chain.
TLS and the authenticated enrollment transcript provide initial channel authenticity; the
self-signature alone is never sufficient. Root recovery without that chain requires a new secure
enrollment ceremony.

The v1 purpose enum is exactly `runner_registry_ceremony`, `connection_acceptance`, `time_anchor`,
`semantic_order`, `delivery_envelope`, `fact_admission`, or `connection_control`; one key entry has
exactly one purpose. Using a valid key under another domain is a purpose violation, not a fallback.
The `fact_admission` key signs only inner Server Fact Admission ACK Snapshots. The
`connection_control` key signs only the separately domain-separated trust-bundle-update, outer
fact-admission-ACK-delivery, and object-bundle-artifact-receipt families defined below;
authorization for any one purpose or sub-domain never authorizes another purpose, a workflow order,
or a delivery envelope.

```text
trustBundleBody = serverCommandTrustBundle_without(trustBundleHash, rootSignature)
trustBundleHash = SHA256(
  UTF8("opzava.runner.command-trust-bundle.digest.v1\0") ||
    RFC8785(trustBundleBody)
)
rootSignature = Ed25519.sign(
  currentCommandRootKey,
  UTF8("opzava.runner.command-trust-bundle.signature.v1\0") ||
    RFC8785(serverCommandTrustBundle_with_hash_without_rootSignature)
)
```

Every later bundle's previous hash must equal the last accepted bundle hash. A bundle may authorize
a new root only through this current-root signature and a strictly newer root epoch; the Runner
persists both highest bundle version for the current enrollment-epoch chain and root epoch before
acknowledging it. Golden vectors cover initial install, overlap, retire, revoke, next-root cutover,
changed-key/same-ID, broken chain, and rollback.

- Planned rotation publishes a higher-version bundle signed by the pinned root while the old bundle
  is still valid. A bounded overlap permits in-flight envelopes, but each semantic order and
  envelope must verify under a key valid for its server-issued time and current bundle policy.
- The Runner persists the highest accepted bundle version and root epoch. A lower version, an old
  root after cutover, a changed key under an existing ID, or an unsigned key is rollback/tamper and
  enters containment-only mode.
- Emergency revoke advances the trust-bundle/root epoch, revokes named command keys, closes current
  Runner connections, stops new command admission, and triggers loss/containment for affected
  execution. Already journaled actions remain evidence; they do not become unperformed.
- Root recovery that cannot be proven by the current pinned root requires secure-UI re-enrollment
  and fingerprint confirmation. TLS authenticates the enrollment channel but never substitutes for
  frame signatures or bundle rollback protection.

Trust-bundle changes use a specialized connection-control path, not a workflow order. If
`connection_accepted.trustBundleVersion` is higher than the Runner's persisted version, the server
sends every missing bundle in order before accepting `connection_ready`; a Current connection also
receives later updates immediately. Each **Server Trust Bundle Update Frame** is closed and contains
exactly `protocolVersion`, `messageKind="runner.trust_bundle_update"`, `updateId`, `runnerId`,
`enrollmentEpoch`, `connectionEpoch`, `transcriptHash`, `bundle`, `trustBundleHash`, `sentAt`,
`serverConnectionControlKeyId`, `updateFrameHash`, and `updateFrameSignature`. The frame
hash/signature use the connection-control key and the domains
`opzava.runner.trust-bundle-update.digest.v1\0` and
`opzava.runner.trust-bundle-update.signature.v1\0`, removing `updateFrameHash` and
`updateFrameSignature` in the same two-stage pattern as a delivery envelope. The embedded bundle's
scope/hash must equal the frame and extend the Runner's pinned chain by exactly one version.

After atomically persisting a valid bundle, the Runner sends the `trust_bundle_ack` transport
payload defined below. The same `(updateId, trustBundleHash)` returns the original ACK; a changed
hash/version under an update ID is collision. The server persists ACK and highest accepted version.
Planned rotation keeps the old delivery-envelope key valid until every targeted Active Runner has
ACKed the successor or entered containment-only. Emergency revoke may close the connection first; if
no still-authorized overlap key can deliver a verifiable update, the Runner admits no command and
must use the secure recovery/re-enrollment path. A bundle is never fetched from an arbitrary URL,
accepted from Slack/MCP, or skipped because `connection_accepted` merely advertised its version.

Every persistent Semantic Runner Fact receives an immutable signed **Server Fact Admission ACK
Snapshot** delivered inside a separately signed current-connection frame. The connection-independent
snapshot's closed schema is exactly
`{ protocolVersion, messageKind:"runner.fact_admission_ack_snapshot", admissionAckId, admissionAckRevision, runnerId, factEnrollmentEpoch, ackSigningEnrollmentEpoch, factId, factKind, factDigest, sequenceBinding, admissionDisposition, admittedContiguousCursor, safeReasonCode, serverReceivedAt, ackIssuedAt, serverFactAdmissionKeyId, admissionAckHash, admissionAckSignature }`.
`admissionDisposition` is exactly `admitted`, `duplicate_admitted`, `pending_gap`, or
`rejected_terminal`; `admittedContiguousCursor` is the canonical unsigned-decimal cursor for the
fact's exact sequence domain and cannot advance across a gap. The digest/signature remove the hash
and then signature respectively under `opzava.runner.fact-admission-ack.digest.v1\0` and
`opzava.runner.fact-admission-ack.signature.v1\0`, signed only by a purpose-authorized
fact-admission key in the server trust bundle. The snapshot contains no connection epoch,
transcript, outer delivery ID, or current-socket key. `factEnrollmentEpoch` equals the immutable
fact's enrollment epoch; `ackSigningEnrollmentEpoch` names the trust-bundle chain that authorized
`serverFactAdmissionKeyId` when this revision was issued. `serverReceivedAt` is the immutable first
server-receive observation for the fact, while `ackIssuedAt` is the signed issuance instant for this
exact ACK revision and must be greater than or equal to `serverReceivedAt`.

The **Fact Admission ACK Delivery** closed schema is exactly
`{ protocolVersion, messageKind:"runner.fact_admission_ack_delivery", admissionAckDeliveryId, runnerId, factEnrollmentEpoch, deliveryEnrollmentEpoch, connectionEpoch, transcriptHash, admissionAckSnapshot, admissionAckSnapshotHash, sentAt, serverConnectionControlKeyId, admissionAckDeliveryHash, admissionAckDeliverySignature }`.
`admissionAckSnapshotHash` equals the embedded snapshot's `admissionAckHash`. The delivery digest
and signature remove their own hash and signature under
`opzava.runner.fact-admission-ack-delivery.digest.v1\0` and
`opzava.runner.fact-admission-ack-delivery.signature.v1\0`; a current purpose-authorized connection-
control key signs it. Outer `runnerId` and `factEnrollmentEpoch` equal the snapshot; outer
`deliveryEnrollmentEpoch`, connection epoch, and transcript equal the current authenticated socket.
For an ordinary Runner-key fact, fact, ACK-signing, and delivery enrollment epochs must all be
identical. Only a valid autonomous-Enforcer fact whose immutable signer/source/sequence contract
explicitly survives enrollment recovery may have an older `factEnrollmentEpoch`; its first ACK
revision after recovery uses the current `ackSigningEnrollmentEpoch`, and delivery always uses the
current `deliveryEnrollmentEpoch`. Exact replay on the same connection returns the same delivery;
replay after reconnect creates a new outer delivery ID/hash/signature around the unchanged inner
snapshot. A changed enrollment relationship outside these rules is rejected before cursor advance.

One `factId` maps permanently and only to one `factDigest`; another digest under that ID is
collision regardless of ACK state. One `admissionAckId` names that fact's admission-ACK stream, and
`admissionAckRevision` is a contiguous unsigned-decimal string starting at `"1"`. The exact same
`(admissionAckId,admissionAckRevision,admissionAckHash)` is idempotent; changed content under the
same ACK revision is collision. A newer revision may only keep the identical fact identity and move
monotonically from `pending_gap` to `admitted` or `rejected_terminal`. `admitted` and
`rejected_terminal` are terminal admission states. After `admitted`, a newer revision may carry
`duplicate_admitted` solely to acknowledge an exact replay; the stored admission state remains
`admitted` and the cursor is identical. The cursor never regresses, and no later ACK may rewrite a
rejected fact or turn a different digest into a duplicate.

Every newer ACK revision has a strictly later `ackIssuedAt`; an exact replay of one revision retains
the original issuance instant. The Runner verifies an inner snapshot signer against the named
`ackSigningEnrollmentEpoch` trust chain and fact-admission key interval valid at `ackIssuedAt`, then
verifies the outer delivery under the current connection-control key at `sentAt`. Key rotation
retains the historical verification chain until every snapshot protected by it is prune-safe; a
later connection never re-signs or rewrites an already-issued inner admission decision. The Runner
durably records the highest valid ACK revision before advancing its server-confirmed and prune-safe
cursors. It may prune a journaled fact only after `admitted` or `duplicate_admitted` closes that
exact contiguous position; `pending_gap` and `rejected_terminal` are retained under the bounded
incident/retention policy and never count as evidence completeness. When replay fills a missing
sequence, the server applies the held fact in order and emits the next signed revision on the same
`admissionAckId`, moving `pending_gap` to `admitted`; if validation can never succeed it moves only
to `rejected_terminal`. The latest signed snapshot is durably replayable on the current or a later
connection even if the original delivery was lost; only its outer delivery binding changes.
Reconnect cursor exchange repeats these same server-confirmed cursors and latest ACK revisions, so
live ACK and reconnect recovery cannot disagree. The closed `DiagnosticsBootstrap` frame allowlist
is only the original or byte-identical replayed `capability_manifest_submission` transport frame,
its Fact Admission ACK Delivery, and—after narrow Enforcer Key Admission—the specialized
`time_anchor_probe`, `time_anchor_echo`, and `time_anchor_accepted` ceremony frames. The already-
admitted connection/trust frames that created the state may be ACKed, but no trust rotation,
heartbeat, reconciliation, second capability challenge, action order, or other persistent fact is
permitted. Managed Harness output follows the ordinary execution-fact ACK path only in `Current`; a
transport ACK or socket write is never fact admission.

### Runner-to-server transport frames and semantic facts

The outer **Runner Transport Frame** is a closed schema with exactly these required fields:
`protocolVersion`, `messageKind="runner.transport_frame"`, `messageId`, `runnerId`,
`enrollmentEpoch`, `keyId`, `connectionEpoch`, `transcriptHash`, `bootIncarnation`, `sentAt`,
`payloadKind`, `payload`, `frameDigest`, and `runnerSignature`. `payloadKind` selects one closed
payload union:

| `payloadKind`      | Exact `payload` members                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transport_ack`    | `deliveryAttemptId`, `deliveryId`, `commandId`, `semanticCommandHash`, `envelopeHash`, `outboxCursor`, `ackDisposition`, `safeReasonCode`                                                                                                     |
| `trust_bundle_ack` | `updateId`, `bundleVersion`, `trustBundleHash`, `ackDisposition`, `safeReasonCode`                                                                                                                                                            |
| `runner_heartbeat` | `heartbeatSequence`, `lastJournaledDeliveryCursor`, `lastSentExecutionFactSequenceByLease`, `lastSentAutonomousFactSequenceByLease`, `lastCapabilityFactSequence`, `lastReconciliationFactSequence`, `livenessState`, `safeHealthReasonCodes` |
| `persistent_fact`  | `runnerFact`                                                                                                                                                                                                                                  |

Delivery `ackDisposition` is exactly `journaled_verified` or `journaled_rejected`; trust-bundle
`ackDisposition` is exactly `persisted_verified` or `rejected_invalid_chain`; `livenessState` is
exactly `available`, `containment_only`, or `unavailable`. The heartbeat sequence-by-lease array and
health-reason array are present, canonically sorted, and duplicate-free. `safeReasonCode` is a
required versioned enum and uses `none` for a successful ACK. `persistent_fact.runnerFact` is the
exact signed object below, not a string or reference.

The inner **Semantic Runner Fact** is a closed schema with exactly these required fields:
`protocolVersion`, `messageKind="runner.semantic_fact"`, `factId`, `factKind`, `runnerId`,
`enrollmentEpoch`, `signerBinding`, `bootIncarnation`, `sequenceBinding`, `sourceBinding`,
`workspaceObservation`, `processObservation`, `observedAt`, `payload`, `factDigest`, and
`factSignature`. It has no `connectionEpoch`, transcript, outer message ID, or outer frame digest.
Its closed unions are:

- `signerBinding={ kind:"runner_enrollment_key", keyId }` or
  `{ kind:"enforcer_outcome_key", enforcerKeyId }`; only an allowed autonomous fact/source may use
  the latter;
- `sequenceBinding={ kind:"capability", capabilitySequence }`,
  `{ kind:"execution", leaseId, receiptSequence }`, or
  `{ kind:"autonomous_enforcer", leaseId, enforcerKeyId, enforcerFactSequence }`, or
  `{ kind:"reconciliation", reconciliationSequence }`;
- `sourceBinding={ kind:"runner_registry", registryAuthorityId, registryAuthorityVersion, actionNonce, deliveryId, deliveryAttemptId, envelopeHash, commandId, semanticCommandHash }`;
  `{ kind:"execution", deliveryId, deliveryAttemptId, envelopeHash, commandId, semanticCommandHash, leaseId, fenceToken, claimAttemptId, devTicketId, readyContractVersion, readyContractHash, executionBindingRef, commandNonce, capabilityAdmissionId, capabilityManifestHash, policyVersion }`;
  `{ kind:"autonomous_enforcer", leaseId, fenceToken, claimAttemptId, devTicketId, readyContractVersion, readyContractHash, executionBindingRef, capabilityAdmissionId, capabilityManifestHash, policyVersion, autonomousContainmentId, enforcerAuthorityCommandId, enforcerAuthoritySemanticCommandHash, enforcerAuthoritySequence, enforcerAuthorityNonce, autonomousTriggerKind, triggerObservationId }`;
  or
  `{ kind:"reconciliation", reconciliationObservationId, deliveryId, deliveryAttemptId, envelopeHash, requestCommandId, requestSemanticCommandHash, registryAuthorityVersion }`;
- `workspaceObservation={ kind:"none" }` or
  `{ kind:"execution_workspace", repositoryId, worktreeGeneration, canonicalWorktreePathHash, branchRef, headSha, dirtyStateDigest, continuationBinding }`;
- `processObservation={ kind:"none" }`,
  `{ kind:"reserved_process", processRegistrationId, processRegistrationVersion, launchAttemptId, containmentHandleDigest, noProcessMarkerDigest }`,
  or
  `{ kind:"observed_process", processRegistrationId, processRegistrationVersion, launchAttemptId, containmentHandleDigest, processIdentityDigest, spawnState }`,
  where `spawnState` is exactly `absent`, `working`, `stopped`, `quarantined`, or `unknown`.

`autonomousTriggerKind` is exactly `local_deadline_elapsed`, `connection_lost`, `daemon_lost`,
`enrollment_revoked`, `command_trust_revoked`, `capability_invalid`, or
`enforcer_restart_containment`. `autonomousContainmentId` is pre-issued by the accepted Enforcer arm
order and authorizes only authority-reducing checkpoint, fence, stop/quarantine, grant disposal, and
preview close for those triggers. It cannot launch, renew, use a grant, or create workflow
authority. Only `lease_enforcer_fenced`, `checkpoint_recorded`, `checkpoint_not_recorded`,
`containment_confirmed`, `containment_incomplete`, `local_grant_disposition_observed`, and
`preview_delivery_closed` may use the autonomous source. The source's `autonomousContainmentId` is
the request identity for `lease_enforcer_fenced`; either checkpoint outcome's `checkpointRequestId`,
both containment variants' `containmentRequestId`,
`local_grant_disposition_observed.grantDispositionRequestId`, and
`preview_delivery_closed.previewDispositionRequestId` each equal it byte-for-byte. The Enforcer
authority identity/hash/sequence/nonce must equal the last accepted arm/renew authority. All other
facts require their delivered source variant.

Capability-manifest and managed-enforcement-quiescence facts require the capability sequence,
Registry source, and both `none` observations. Ordinary execution facts require the execution
sequence and delivered-execution source. The seven authority-reducing autonomous facts require the
autonomous-Enforcer sequence/source/signer. Both require execution workspace except a
`prepare_execution_registration` no-action rejection or before-registration Human/policy
replacement, each of which requires `none`/`none` because it proves no registration, worktree
action, or process began. A `start_execution` no-action rejection retains the existing execution
workspace/reserved process and proves only that spawn did not begin. The fact row below selects
every allowed process variant. Reconciliation facts require the reconciliation sequence/source and
carry observed workspace/process inventory only inside their typed payload. A mismatched union,
missing member, extra member, wrong sequence family, or forbidden `none` is schema rejection before
signature admission.

The closed `payload` union selected by `factKind` is:

| `factKind`                                                                | Exact `payload` members                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command_rejected_no_action`                                              | `rejectedCommandKind`, `rejectionPhase`, `reasonCode`, `spawnState`, `noActionProofDigest`, `originalDispositionId`                                                                                                                                                                                                                                                                                                     |
| `capability_manifest_submission`                                          | `challengeId`, `challengeNonce`, `capabilitySequence`, `capabilityManifest`, `capabilityManifestHash`, `probeResults`, `bypassCoverageObjects`, `denyCanaryReceipts`, `enforcerKeyProofSignature`                                                                                                                                                                                                                       |
| `managed_enforcement_quiescence_report`                                   | `capabilitySequence`, `managedEnforcementRotationId`, `priorManagedEnforcementAdmissionId`, `candidateManagedEnforcementAdmissionId`, `enforcementAdapterId`, `quiescenceNonce`, `managedEnforcementFreezeId`, `expectedAdmittedDecisionSequence`, `expectedAdmittedManagedEnvelopeSequenceByProcess`, `finalDecisionSequence`, `finalManagedEnvelopeSequenceByProcess`, `quiescedAt`, `managedEnforcementFreezeDigest` |
| `process_registration_reserved`                                           | `processRegistrationId`, `processRegistrationVersion`, `launchAttemptId`, `continuationBinding`, `adapterPlan`, `adapterPlanDigest`, `namedSecretReservations`, `namedSecretReservationDigest`, `containmentReservationId`, `containmentHandleDigest`, `realizedResourceReservations`, `noProcessMarkerDigest`                                                                                                          |
| `secret_grants_activated`                                                 | `grantSetDigest`, `activatedGrantHandleIds`, `brokerCapabilityBindings`, `activationOutcomeDigest`, `reasonCode`                                                                                                                                                                                                                                                                                                        |
| `secret_grant_activation_failed`                                          | `grantSetDigest`, `grantActivationDispositions`, `activationOutcomeDigest`, `reasonCode`, `noSpawnProofDigest`                                                                                                                                                                                                                                                                                                          |
| `lease_enforcer_armed`, `lease_enforcer_renewed`, `lease_enforcer_fenced` | `enforcerOutcome`                                                                                                                                                                                                                                                                                                                                                                                                       |
| `execution_started`                                                       | `spawnMarkerDigest`, `processIdentityDigest`, `workingObservationDigest`                                                                                                                                                                                                                                                                                                                                                |
| `checkpoint_recorded`                                                     | `checkpointId`, `checkpointRequestId`, `repositoryHeadSha`, `dirtyStateDigest`, `processStateDigest`, `grantStateDigest`, `containerPortStateDigest`, `artifactRefs`                                                                                                                                                                                                                                                    |
| `checkpoint_not_recorded`                                                 | `checkpointRequestId`, `checkpointAttemptId`, `checkpointDisposition`, `reasonCode`, `lastTrustedCheckpointBinding`                                                                                                                                                                                                                                                                                                     |
| `containment_confirmed`                                                   | `containmentRequestId`, `containmentDisposition`, `processSetDigest`, `worktreeStateDigest`, `remainingResourceRefs`                                                                                                                                                                                                                                                                                                    |
| `containment_incomplete`                                                  | `containmentRequestId`, `containmentDisposition`, `processSetDigest`, `worktreeStateDigest`, `remainingResourceRefs`, `reasonCode`                                                                                                                                                                                                                                                                                      |
| `local_grant_disposition_observed`                                        | `grantDispositionRequestId`, `grantDispositions`, `localDispositionDigest`                                                                                                                                                                                                                                                                                                                                              |
| `preview_delivery_closed`                                                 | `previewDispositionRequestId`, `closedPreviewDeliveryIds`, `failedPreviewDeliveryIds`, `previewDispositionDigest`, `reasonCode`                                                                                                                                                                                                                                                                                         |
| `human_input_required`                                                    | `reasonCode`, `safeInputSchemaRef`, `choiceIds`, `requestedInputExpiresAt`, `commandPhase`, `spawnState`, `phaseProofDigest`                                                                                                                                                                                                                                                                                            |
| `policy_denied`                                                           | `reasonCode`, `deniedPolicyRuleId`, `policyVersion`, `commandPhase`, `spawnState`, `phaseProofDigest`                                                                                                                                                                                                                                                                                                                   |
| `managed_harness_envelope`                                                | `managedEnvelope`                                                                                                                                                                                                                                                                                                                                                                                                       |
| `exact_ref_publication_submission`                                        | `publicationPreparationId`, `publicationNonce`, `publicationPreparationCommandId`, `publicationPreparationSemanticCommandHash`, `exactRef`, `expectedOldSha`, `proposedNewSha`, `proposedTreeSha`, `objectManifestDigest`, `objectBundleDigest`, `objectBundleArtifactRef`, `submissionDigest`                                                                                                                          |
| `reconciliation_observation`                                              | `reconciliationObservationId`, `inventorySchemaVersion`, `lastJournaledDeliveryCursor`, `executionFactSequenceByLease`, `autonomousFactSequenceByLease`, `capabilityFactSequence`, `processInventory`, `worktreeInventory`, `grantInventory`, `brokerOperationInventory`, `containerPortInventory`, `containmentDispositions`                                                                                           |

Every array is present and duplicate-free. String/UUID/ref arrays sort by ascending UTF-8 byte order
of the canonical value; digest arrays sort by the lowercase digest string. Object arrays use these
ascending tuple keys: execution sequences `(leaseId)`; autonomous sequences
`(leaseId,enforcerKeyId)`; process inventory `(leaseId,processRegistrationId,launchAttemptId)`;
worktree inventory `(leaseId,repositoryId,worktreeGeneration)`; grants `(leaseId,grantHandleId)`;
broker operations `(leaseId,brokerCapabilityId,requestSequence)`; container/ports
`(leaseId,resourceKind,resourceId)`; containment `(leaseId,containmentRequestId)`; artifact refs
`(artifactId,contentDigest)`; remaining resources `(resourceKind,resourceId)`; managed skill/MCP
refs by their explicitly named first field; and every other row by the ID explicitly stated in its
owning schema. Equal complete identity keys are duplicates and rejected, so no unspecified
tie-breaker remains. Every nested item uses the containing `protocolVersion` or its explicitly named
schema/policy version; no nested item is unversioned or implementation-extensible. Artifact refs,
action refs, and remaining-resource refs are opaque safe IDs, never paths, URLs with bearer tokens,
logs, prompts, or secrets. Exact nested schemas for `capabilityManifest`, `enforcerOutcome`, and
reconciliation inventory are defined in their owning sections in this memo; no implementation may
add an unlisted field.

Observation variants are exact by fact kind: capability and reconciliation use `none`/`none`.
`command_rejected_no_action` uses `none`/`none` only for
`rejectedCommandKind="prepare_execution_registration"` with `rejectionPhase="before_registration"`;
for `rejectedCommandKind="start_execution"` it uses `execution_workspace`/`reserved_process`,
`rejectionPhase="before_spawn"`, and payload `spawnState="absent"`. Registration rejection also
requires payload `spawnState="absent"`. No other rejected command/phase is valid. Registration,
secret activation/failure, and Enforcer arm use `execution_workspace`/`reserved_process`; start and
`checkpoint_recorded` use `execution_workspace`/`observed_process`. `checkpoint_not_recorded`
requires `execution_workspace` and allows `reserved_process` or `observed_process`, because a
bounded attempt can fail before spawn or after process state becomes uncertain.
`managed_harness_envelope` also requires `execution_workspace`/`observed_process`, and all process
identities must equal its managed envelope. Enforcer fence, containment, and grant disposition allow
exactly `reserved_process` or `observed_process` because either may occur before spawn. Enforcer
renew, preview disposition, and publication require `observed_process`. A
`prepare_execution_registration` Human/policy replacement requires `none`/`none`,
`commandPhase="before_registration"`, and `spawnState="absent"`; it therefore cannot imply that a
workspace or registration exists. Any later pre-spawn Human/policy fact requires
`execution_workspace`/`reserved_process`, `commandPhase="before_spawn"`, and `spawnState="absent"`.
After spawn it requires `observed_process`, `commandPhase="managed_runtime"`, and
payload/observation `spawnState` equality. No other combination is allowed.

For either Human/policy fact,
`phaseProofBody={ factKind, commandId, semanticCommandHash, commandPhase, workspaceObservation, processObservation, spawnState, reasonCode }`
equality-binds the signed source and exact observations. `phaseProofDigest` is
`SHA256(UTF8("opzava.runner.governed-phase-proof.digest.v1\0") || RFC8785(phaseProofBody))`. Thus a
before-registration outcome proves the primary registration effect did not begin without inventing a
workspace or reserved process; changed phase/observation bytes are collision.

`checkpointDisposition` is exactly `failed`, `unavailable`, or `deadline_exceeded`, and its
`reasonCode` is a non-`none` safe reason. `lastTrustedCheckpointBinding` is exactly
`{ kind:"none" }` or `{ kind:"existing", checkpointId, checkpointLineageHash }`; it reports only
previously admitted evidence and never invents a new checkpoint.

For delivered checkpoints, either checkpoint outcome's `checkpointRequestId` equals the originating
`checkpoint_execution.checkpointRequestId`; under `checkpoint_and_stop_or_quarantine` it equals that
order's `containmentRequestId`. The multi-fact containment order also uses that same value as its
grant-disposition, preview-disposition, and containment request ID. These equalities, and the
autonomous equalities above, are required before sequence admission.

The reconciliation arrays also have closed item schemas:

- `executionFactSequenceByLease[]={ leaseId, lastSentReceiptSequence }`;
- `autonomousFactSequenceByLease[]={ leaseId, enforcerKeyId, lastSentEnforcerFactSequence }`;
- `processInventory[]={ leaseId, processRegistrationId, processRegistrationVersion, launchAttemptId, processIdentityDigest, containmentHandleDigest, spawnState }`;
- `worktreeInventory[]={ leaseId, repositoryId, worktreeGeneration, canonicalWorktreePathHash, branchRef, headSha, dirtyStateDigest }`;
- `grantInventory[]={ leaseId, grantHandleId, localDisposition }`;
- `brokerOperationInventory[]={ leaseId, brokerCapabilityId, requestId, requestSequence, requestNonce, requestDigest, committedUseCount, providerOperationState, brokerReceiptDigest }`;
- `containerPortInventory[]={ leaseId, resourceId, resourceKind, disposition }`;
- `containmentDispositions[]={ leaseId, containmentRequestId, containmentDisposition, dispositionDigest }`.

Authority-critical process proofs use only these closed preimages:

```text
noProcessMarkerBody = {
  runnerId, enrollmentEpoch, leaseId, fenceToken, claimAttemptId, devTicketId,
  processRegistrationId, processRegistrationVersion, launchAttemptId,
  containmentHandleDigest, spawnState:"absent"
}
noProcessMarkerDigest = SHA256(
  UTF8("opzava.runner.no-process-marker.digest.v1\0") || RFC8785(noProcessMarkerBody)
)
noActionProofBody = {
  commandId, semanticCommandHash, deliveryId, deliveryAttemptId, envelopeHash,
  rejectedCommandKind, rejectionPhase, processRegistrationId,
  processRegistrationVersion, launchAttemptId, spawnState:"absent",
  processMarkerBinding
}
noActionProofDigest = SHA256(
  UTF8("opzava.runner.no-action-proof.digest.v1\0") || RFC8785(noActionProofBody)
)
noSpawnProofBody = {
  commandId, semanticCommandHash, grantSetDigest, grantActivationDispositions,
  noProcessMarkerDigest, spawnState:"absent"
}
noSpawnProofDigest = SHA256(
  UTF8("opzava.runner.no-spawn-proof.digest.v1\0") || RFC8785(noSpawnProofBody)
)
processIdentityBody = {
  runnerId, enrollmentEpoch, leaseId, fenceToken, processRegistrationId,
  processRegistrationVersion, launchAttemptId, containmentHandleDigest,
  rootProcessIdentityDigest, processGroupIdentityDigest, descendantPolicyDigest
}
processIdentityDigest = SHA256(
  UTF8("opzava.runner.process-identity.digest.v1\0") || RFC8785(processIdentityBody)
)
spawnMarkerBody = {
  startCommandId, startSemanticCommandHash, processRegistrationId,
  processRegistrationVersion, launchAttemptId, processIdentityDigest,
  adapterPlanDigest, spawnState:"working", startedAt
}
spawnMarkerDigest = SHA256(
  UTF8("opzava.runner.spawn-marker.digest.v1\0") || RFC8785(spawnMarkerBody)
)
workingObservationBody = {
  processRegistrationId, processRegistrationVersion, launchAttemptId,
  processIdentityDigest, spawnState:"working", observedAt
}
workingObservationDigest = SHA256(
  UTF8("opzava.runner.working-observation.digest.v1\0") ||
    RFC8785(workingObservationBody)
)
```

`processMarkerBinding` is exactly `{ kind:"not_created" }` for a before-registration rejection or
`{ kind:"existing", noProcessMarkerDigest }` for a before-spawn rejection. The registration/start
order supplies every identity in these preimages; the fact/source/observations equality-match them.
`processIdentityBody` and the spawn marker are durable Harness Supervisor records written before the
`execution_started` fact, not model claims. `grantActivationDispositions` uses the exact sorted
closed array below. Exact proof replay returns the same digest; changed content is collision.

`artifactRefs[]` items are exactly `{ artifactId, contentDigest, mediaType, safeSizeBytes }`;
`brokerCapabilityBindings[]` items are exactly
`{ grantHandleId, brokerCapabilityId, operationKind, destinationBindingDigest, usePolicy, maxUses, dispositionCursor, expiresAt }`,
sorted by grant-handle ID; `operationKind` is `authenticated_provider_request`, `usePolicy` is
`one_use` or `bounded_use`, and `maxUses` is a positive canonical unsigned-decimal string that must
equal `"1"` for `one_use`; `objectBundleArtifactRef` is exactly
`{ artifactAdmissionId, artifactId, contentDigest, mediaType, safeSizeBytes, availableUntil }`, with
`mediaType="application/vnd.opzava.git-object-bundle.v1"` and `contentDigest=objectBundleDigest`;
`remainingResourceRefs[]` items are exactly `{ resourceId, resourceKind, disposition }`. Enum values
come only from the named protocol/schema version. `safeInputSchemaRef` is a server-owned opaque
reference to the Ready-approved closed schema, not a Runner-supplied schema object.

Each `grantActivationDispositions[]` item is exactly
`{ kind:"activated", grantHandleId, brokerCapabilityId, dispositionCursor }` or
`{ kind:"failed", grantHandleId, dispositionCursor, localDisposition, reasonCode }`, sorted by
grant-handle ID. `dispositionCursor` is contiguous per grant handle from `"1"`. For either
activation fact,
`activationOutcomeBody={ factKind, grantSetDigest, activatedGrantHandleIds, brokerCapabilityBindings, grantActivationDispositions, reasonCode }`;
the selected fact uses its listed arrays and represents every unselected array as present and empty
inside this digest body. `activationOutcomeDigest` is
`SHA256(UTF8("opzava.runner.secret-activation-outcome.digest.v1\0") || RFC8785(activationOutcomeBody))`.
Every required handle appears exactly once across the activated/failure representation. For
`secret_grants_activated`, `reasonCode` is exactly `none`; for `secret_grant_activation_failed`, it
is a non-`none` safe reason allowed by the closed registry. The zero-grant golden vector uses the
exact registration-bound empty `grantSetBody`, empty activated/broker/disposition arrays, and
`reasonCode="none"` in the activation-outcome preimage.

Each `grantDispositions[]` item is exactly
`{ grantHandleId, brokerCapabilityId, localDisposition, dispositionCursor, dispositionDigest }`,
sorted by grant-handle ID. Its digest uses the domain
`opzava.runner.local-grant-disposition.digest.v1\0` over the item without that digest;
`localDispositionDigest` uses `opzava.runner.local-grant-disposition-set.digest.v1\0` over the
complete array. A grant is releasable only for `removed` or `not_found`; `removal_failed` is
evidence of retained containment, not disposal. `providerOperationState` is exactly
`not_dispatched`, `dispatched_unknown`, `succeeded`, or `failed`; the Broker inventory preserves the
exact request identity needed to reconcile `dispatched_unknown` without minting another provider
action.

`containment_confirmed.containmentDisposition` is only `stopped` or `quarantined`, and its
`remainingResourceRefs` must all have a terminal safe disposition. Unknown/partial outcomes use
`containment_incomplete` with `containmentDisposition="unknown"`; that fact can trigger further
containment but can never release capacity, worktree, grants, or workflow authority.

`managedEnvelope` is a closed object with exactly `protocolVersion`, `managedEnvelopeId`,
`managedEnvelopeKind`, `producerSequence`, `runnerId`, `enrollmentEpoch`, `leaseId`, `fenceToken`,
`processRegistrationId`, `processRegistrationVersion`, `launchAttemptId`,
`managedEnforcementAdmissionId`, `harnessAdapterKind`, `harnessAdapterVersion`, `toolKind`,
`toolObservedVersion`, `controlMode`, `skillRevisionRefs`, `mcpRevisionRefs`, `profileRevision`,
`policyRevision`, `decisionReceipt`, `decisionUseReceipt`, `redactionResult`, `contentBinding`,
`artifactDispositions`, `artifactRefs`, `observedAt`, and `managedEnvelopeDigest`.
`managedEnvelopeKind` is exactly `status_transition`, `worklog`, `command_evidence`,
`test_evidence`, `summary`, or `failure`; `producerSequence` is contiguous per process registration
from `"1"`. Skill refs are exactly `{ skillCanonicalName, skillRevisionDigest }`; MCP refs are
exactly `{ mcpServerId, mcpRevisionDigest }`, sorted by their first field.

`decisionReceipt` is exactly `{ kind:"not_applicable" }` for an envelope not caused by a tool call,
or
`{ kind:"tool_call", decisionReceiptId, callId, decisionSequence, decisionUseNonce, runnerId, enrollmentEpoch, leaseId, fenceToken, processRegistrationId, launchAttemptId, managedEnforcementAdmissionId, projectedToolName, approvedToolSchemaHash, canonicalArgumentsDigest, managedToolTargetBinding, targetBindingDigest, toolInvocationDigest, profileRevision, policyRevision, decision, reasonCode, decidedAt, enforcementDecisionKeyId, decisionReceiptDigest, decisionReceiptSignature }`.
`decision` is `allow` or `deny`; its sequence is contiguous per managed-enforcement admission. The
receipt digest/signature use the domains `opzava.runner.managed-enforcement-decision.digest.v1\0`
and `opzava.runner.managed-enforcement-decision.signature.v1\0` with the admitted enforcement
decision key and the standard remove-digest/remove-signature pattern. `canonicalArgumentsDigest`
hashes the schema-validated RFC 8785 arguments under
`opzava.runner.managed-tool-arguments.digest.v1\0`.

`managedToolTargetBinding` is exactly `{ kind:"none" }` or
`{ kind:"governed_target", targetNamespace, targetOpaqueId, targetRevision, targetScopeDigest }`.
`none` is legal only when the admitted tool-schema row explicitly declares the invocation
targetless. Otherwise `targetNamespace` is a versioned enum from that row, `targetOpaqueId` is a
server-owned opaque identifier (never a path, credential-bearing URL, model-supplied hostname, or
secret), `targetRevision` pins the admitted target version, and `targetScopeDigest` binds its
tenant/ repository/resource scope. `targetBindingDigest` is exactly
`SHA256(UTF8("opzava.runner.managed-tool-target-binding.digest.v1\0") || RFC8785(managedToolTargetBinding))`.
The receipt and the actual Adapter invocation must equality-match the target object resolved from
the accepted Adapter plan plus current server-owned tool/MCP/skill policy. The Adapter recomputes
the object and digest after schema validation and immediately before CAS reservation/forwarding.
Changed namespace, opaque ID, revision, scope, targetless substitution, or argument-derived
redirection denies before forwarding and contains any direct bypass.

`toolInvocationDigest` hashes exactly
`{ callId, projectedToolName, approvedToolSchemaHash, canonicalArgumentsDigest, managedToolTargetBinding, targetBindingDigest, runnerId, enrollmentEpoch, leaseId, fenceToken, processRegistrationId, launchAttemptId, managedEnforcementAdmissionId, profileRevision, policyRevision }`
under `opzava.runner.managed-tool-invocation.digest.v1\0`.

`decisionUseReceipt` is `{ kind:"not_applicable" }` only with a not-applicable decision. Otherwise
it is one of the closed signed objects
`{ kind:"not_forwarded", decisionReceiptId, decisionUseNonce, toolInvocationDigest, reasonCode, recordedAt, enforcementDecisionKeyId, decisionUseDigest, decisionUseSignature }`,
`{ kind:"forwarded", decisionReceiptId, decisionUseNonce, toolInvocationDigest, forwardedAt, enforcementDecisionKeyId, decisionUseDigest, decisionUseSignature }`,
or
`{ kind:"forwarding_unknown", decisionReceiptId, decisionUseNonce, toolInvocationDigest, reservedAt, enforcementDecisionKeyId, decisionUseDigest, decisionUseSignature }`.
The digest/signature use `opzava.runner.managed-tool-use.digest.v1\0` and
`opzava.runner.managed-tool-use.signature.v1\0` with the same admitted decision key. A deny requires
`not_forwarded`. Before an allowed call, the enforcement Adapter atomically CAS-reserves the exact
unused `(decisionReceiptId,decisionUseNonce,toolInvocationDigest)` in its durable journal; only the
winner may forward, and it then records `forwarded` or `forwarding_unknown`. Exact replay returns
that terminal use receipt and never forwards again. A changed invocation, already used receipt,
missing use receipt, or direct call is a bypass violation that contains execution.

`redactionResult` is exactly `passed`, `redacted_safe`, `secret_suspected_quarantined`,
`rejected_oversize`, or `rejected_policy_disallowed`. `contentBinding` is exactly
`{ kind:"none", contentHash }`, `{ kind:"safe_ref", safeContentRef, contentHash }`, or
`{ kind:"quarantined", quarantineRef, contentHash }`. A suspected-secret, oversize, or
policy-disallowed result cannot use `safe_ref`; `none` uses
`SHA256(UTF8("opzava.runner.no-managed-envelope-content.v1\0"))`; the quarantine ref is opaque and
not readable by the Harness. `managedEnvelopeDigest` is the domain-separated digest of the object
without that field under `opzava.runner.managed-harness-envelope.digest.v1\0`. All
envelope/source/decision Runner/lease/fence/process/admission/revision identities must equal. The
Runner buffers only signed envelopes inside its bounded encrypted journal, replays them through the
ordinary execution fact sequence, and cannot claim required evidence complete until the signed live
fact-admission ACK advances the exact server-confirmed cursor.

Each attempted managed artifact has exactly one `artifactDispositions[]` item, sorted by artifact ID
and digest:
`{ kind:"admitted_safe", artifactId, contentDigest, mediaType, safeSizeBytes, safeArtifactRef, policyVersion, artifactDispositionDigest }`,
`{ kind:"quarantined", artifactId, contentDigest, mediaType, safeSizeBytes, quarantineRef, reasonCode, policyVersion, artifactDispositionDigest }`,
or
`{ kind:"rejected", artifactId, contentDigest, mediaType, safeSizeBytes, rejectionKind, reasonCode, policyVersion, artifactDispositionDigest }`,
where `rejectionKind` is exactly `oversize` or `policy_disallowed`. `artifactRefs` contains exactly
the admitted-safe artifact IDs/digests and no rejected/quarantined item. Each disposition digest
removes `artifactDispositionDigest` under `opzava.runner.managed-artifact-disposition.digest.v1\0`;
the enclosing signed managed envelope binds the complete sorted array. A policy-disallowed or
oversized artifact therefore has a safe typed receipt even when no artifact ref exists; raw content,
path, policy detail, or secret is forbidden.

Typed outer frames and inner facts mean:

| Kind                                                                        | Meaning                                                                                                               | Not sufficient for                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `transport_ack`                                                             | Exact delivery-envelope attempt was journaled and its semantic-command equality was verified or rejected              | process start, checkpoint, lane change                                          |
| `command_rejected_no_action`                                                | Registration or spawn command was rejected with phase-specific proof that its prohibited local action did not begin   | resource release without matching WF-230 containment/grant confirmations        |
| `capability_manifest_submission`                                            | Challenge-bound signed capability observation with monotonic capability sequence                                      | capability admission or claim/start eligibility                                 |
| `managed_enforcement_quiescence_report`                                     | Order-bound signed freeze and final managed decision/envelope cursors for one planned rotation                        | cutover before server cursor equality and the atomic lifecycle transaction      |
| `process_registration_reserved`                                             | Pre-spawn launch reservation, Adapter plan, containment handle, and durable no-process marker                         | process start or secret-grant activation                                        |
| `secret_grants_activated`                                                   | Every required opaque grant handle is locally active for the exact pre-spawn registration                             | process spawn or proof the value was never exposed                              |
| `secret_grant_activation_failed`                                            | Named safe reason and per-handle disposition; spawn remains forbidden                                                 | containment release without no-process/grant-disposal proof                     |
| `lease_enforcer_armed` / `lease_enforcer_renewed` / `lease_enforcer_fenced` | Exact authority order hash/nonce/sequence and independent-Enforcer outcome                                            | workflow renewal, process termination, or grant disposal by itself              |
| `execution_started`                                                         | Durable spawn marker exists and exact supervised process is alive/working in bound worktree                           | bypassing `RecordExecutionStartedReceipt`/`AcceptExecutionStarted`              |
| `checkpoint_recorded`                                                       | Exact process/worktree observation and artifact digest were durably captured                                          | proof process stopped or clean Review evidence                                  |
| `checkpoint_not_recorded`                                                   | One bounded checkpoint attempt ended safely without a new checkpoint, with a typed reason and last trusted binding    | permission to delay cleanup/containment or claim a clean checkpoint             |
| `containment_confirmed`                                                     | Exact process tree/worktree is stopped or quarantined for the named Runner Containment Request                        | external credential/tunnel revocation or DevTicket transition                   |
| `containment_incomplete`                                                    | Stop/quarantine remains partial or unknown with exact remaining resources                                             | release of capacity, worktree, grant, or workflow authority                     |
| `local_grant_disposition_observed`                                          | Per-handle removed/not-found/failure state for the exact disposition request                                          | underlying provider credential revoked upstream or release after failure        |
| `preview_delivery_closed`                                                   | Named preview deliveries are closed or safely reported failed for the exact disposition request                       | process containment, tunnel-provider revocation, or workflow transition         |
| `human_input_required`                                                      | Bounded safe-input request and originating command phase require a server-created governed Human action               | approval, policy change, process stop, or automatic retry                       |
| `policy_denied`                                                             | Current Adapter/tenant policy rejected the exact typed operation with a stable safe reason code                       | Human rejection, permanent failure, or permission to weaken policy              |
| `managed_harness_envelope`                                                  | Policy-decision-bound, redaction-scanned status/worklog/test/summary/failure output from the admitted managed Harness | workflow transition, approval, or evidence completeness before server admission |
| `exact_ref_publication_submission`                                          | Authenticated #231 handoff for exact ref/old/new commit/tree SHA and object-manifest/bundle digests                   | provider acceptance, ref update, PR/check/merge fact, or force push             |
| `reconciliation_observation`                                                | Current process/worktree/grant/journal facts after reconnect/reboot                                                   | automatic resume or old-lease resurrection                                      |
| `runner_heartbeat`                                                          | Connection/daemon liveness and current journal cursors                                                                | process truth, lease grant, start, or checkpoint                                |

Sequence and idempotency domains are disjoint:

| Family                                  | Exact identity/sequence rule                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection_proof` / `connection_ready` | Specialized preimages above; proof is single-use by `(runnerId, enrollmentEpoch, challengeId, clientNonce)`, and ready is idempotent only by `(runnerId, enrollmentEpoch, connectionEpoch, transcriptHash)`. Neither carries `receiptSequence`.                                                                                  |
| `transport_ack`                         | No numeric sequence. Identity is `(deliveryAttemptId, envelopeHash, connectionEpoch)` plus the bound `deliveryId`, `commandId`, and semantic hash; an exact replay returns the prior ACK and changed mapping is collision.                                                                                                       |
| `runner_heartbeat`                      | `heartbeatSequence` is an unsigned decimal string, starts at `"1"` for each connection epoch, and must strictly increase. Exact same sequence/frame digest is duplicate; lower/different is stale/collision. Gaps are allowed because heartbeat loss carries no workflow fact; they degrade liveness only.                       |
| capability and managed-quiescence facts | `capabilitySequence` is contiguous per `(runnerId, enrollmentEpoch)`, starts at `"1"`, survives reboot/connection changes, and is bound to the originating single-use capability challenge/nonce or managed-enforcement quiescence order/nonce.                                                                                  |
| execution-lease semantic facts          | `receiptSequence` is contiguous per `(runnerId, enrollmentEpoch, leaseId)`, starts at `"1"`, never resets on daemon reboot/reconnect, and applies to no-action, registration, grant, Enforcer-wrapper, start, checkpoint, containment, grant/preview disposition, Human/policy, and publication-submission facts for that lease. |
| autonomous-Enforcer facts               | `enforcerFactSequence` is contiguous per `(runnerId, leaseId, enforcerKeyId)`, starts at `"1"`, survives Runner enrollment/connection/boot changes, and applies only to the seven authority-reducing autonomous facts. The Enforcer key signs them directly.                                                                     |
| `reconciliation_observation`            | `reconciliationSequence` is contiguous per `(runnerId, enrollmentEpoch)`, starts at `"1"`, survives reboot, and binds one observation ID plus the sorted lease/process inventory. It never substitutes for any lease's receipt sequence.                                                                                         |

For every persistent contiguous domain, exact same sequence plus inner `factDigest` is idempotent;
the same sequence with another fact digest is collision; a lower sequence is stale; and a gap is
`pending_gap` with no workflow application until replay closes it. A replay embeds the unchanged
fact in a new outer frame, whose new `frameDigest` is transport identity only. Server uniqueness
keys include the named fact scope, and one `factId` maps one-to-one to one fact digest; reusing it
with another digest is collision. A fact whose kind carries the wrong sequence union, two sequence
variants, or an execution sequence without that lease is schema-invalid before signature admission.

Every deliberately repeated identity is an equality constraint, never precedence. Outer
frame-to-fact Runner identities, ordinary-fact enrollment/key identities, and boot identities under
the explicit immutable restart/autonomous-replay rules above; fact sequence-to-payload/manifest
sequences; source-to-order delivery/command/hash and lease/fence/claim/contract identities;
challenge expected key-to-ordinary-fact signer key, expected connection-to-the-original stored
delivery envelope, expected boot-to-fact/manifest producer boot, and
challenge/nonce-to-submission/manifest identities; workspace-to-process registration/worktree
identities; nested Enforcer-to-source authority identities; exact-ref preparation-to-submission
fields; and reconciliation request-to-observation identities must be byte-for-byte or
canonical-value equal as applicable. Any mismatch rejects the object before dedupe, persistence,
ACK, or workflow application; no outer, inner, or later copy "wins."

`human_input_required` and `policy_denied` are governed outcomes, not unstructured tool stderr. Both
bind the originating command/delivery, lease/fence/contract, process registration/launch phase,
Harness Adapter/tool/version/mode, stable reason code, policy version, and whether durable spawn is
proved absent, present, or unknown. `human_input_required` may request only a schema ref listed in
the originating order's `humanInputPolicyBinding`, bounded choice IDs, and an expiry no later than
`maxRequestedExpiryAt`; it never invents a `secureActionRef`, embeds a raw vendor prompt, or asks
for credentials in Slack. `policy_denied` names the denied capability/policy rule without exposing
secret values.

Admitting that fact transactionally creates one server-owned **Human Input Action** with a new
opaque `secureActionRef`, exact fact/command/lease/fence/contract/schema/choices binding, effective
expiry `min(requestedInputExpiresAt,maxRequestedExpiryAt,current policy cap)`, and lifecycle
`Pending -> Consumed|Expired|Revoked`. Only secure Opzava UI can consume it by CAS with current
Human authorization and one safe value matching the closed schema. Expiry/revocation racing a
consume has one database winner; a losing or replayed submission returns the recorded terminal state
and creates no command. Fence, material Revision, Ready/policy change, role loss, or Absolute Stop
revokes Pending. A successful consume records the safe value/ref under the approved secret or input
contract and creates a new authorized command/version; it never mutates the original fact. Slack and
Ask Admin receive only the server-created action link/status.

The owning server command handler records the outcome, deduplicates it by command/phase/nonce, and
selects the WF-230 transition. Before spawn, accepted no-process proof may enter the governed
pre-start/Blocked path. After spawn or when process state is unknown, the Runner must checkpoint and
contain before waiting. The Human Owner is notified through Slack with a link to the Card/secure UI;
free text is discussion only. Human input or a policy change creates a new authorized
command/version and retry—it never mutates or “approves” the original receipt, relaxes policy
locally, or causes the Harness Adapter to wait forever.

### Delivery, dedupe, sequence, and time

- Delivery is at least once. Before acting, both server and Runner durably bind
  `commandId ↔ semanticCommandHash` independently of transport. Reusing a `commandId` with another
  semantic hash is a collision even if `deliveryId` is new; a retry cannot evade command dedupe by
  changing delivery identity. Separately, one `deliveryId` is bound to that command/hash, and each
  network attempt is bound as `(deliveryAttemptId, envelopeHash, connectionEpoch)`. The same
  command/hash or delivery returns the original action disposition regardless of a legitimate
  reconnect envelope; the same attempt/hash returns the original ACK. A changed command/hash,
  delivery mapping, or attempt/hash is a protocol incident and suspends the connection. Different
  connection epochs and attempt IDs alone are not collisions.
- Each lease owns a durable next receipt sequence in the Runner journal. Reboot changes boot
  incarnation but never resets the lease sequence. The server has uniqueness on
  `(runner, enrollmentEpoch, lease, sequence)` and on type-specific nonce identity.
- Exact same persistent sequence and inner `factDigest` is an idempotent duplicate even when a
  reconnect changes the outer frame digest. Same sequence with another fact digest/key is a
  collision: stop accepting authority from the connection and contain the lease when one exists.
- A sequence gap or out-of-order semantic fact is durably held as `pending_gap`, never applied to
  workflow, and prompts bounded replay from the missing cursor. When replay closes the gap, the
  server applies held facts in order and emits monotone signed ACK revisions from `pending_gap` to
  `admitted`; the fact identity/digest never changes. If replay cannot close the gap, execution is
  unknown and the detector invokes WF-230 loss containment, after which the ACK may become only
  `rejected_terminal`. Later sequence does not overwrite an earlier checkpoint.
- `serverReceivedAt` is authoritative for key/epoch/expiry admission. Runner `observedAt`
  participates only in WF-230's bounded start-deadline arbitration after signature, sequence,
  monotonic identity, and configured skew checks. Socket arrival order is never event order.
- Heartbeat cadence, expiry, grace, and reconnect backoff are versioned server policy. A heartbeat
  cannot renew a lease, alter an Enforcer deadline, or authorize beyond signed authority. Current
  heartbeat/connection health is only an input to Execution Admission; renewal occurs solely through
  a durable server decision and accepted signed `renew_lease_enforcer` order/outcome.

## Exact WF-230 mapping

| WF-230 state/command                                                | #232 fact or delivery                                                             | Required result                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ClaimRequested` / retry                                            | current Runner Enrollment and Capability Manifest refs                            | Execution Admission reauthorizes them; Runner worker gains no claimant authority                 |
| `PrepareClaim` / `ClaimAttempt(credential_provisioning)`            | pre-spawn registration → Enforcer arm → typed secret-grant activation receipts    | no start deadline/process; values never enter Opzava; each step is independently durable         |
| registration + Enforcer arm + all grants accepted → `start_pending` | one durable `start_execution` binding their accepted fact digests and exact nonce | ACK is not start; duplicate delivery never duplicates spawn                                      |
| `RecordExecutionStartedReceipt`                                     | verified `execution_started` semantic fact                                        | minimal safe envelope enters Runner inbox before lane worker                                     |
| `AcceptExecutionStarted`                                            | consumes verified inbox fact                                                      | only Execution Admission moves Todo/Starting to In Progress                                      |
| signed no-process rejection                                         | `command_rejected_no_action` with exact start nonce and durable no-spawn proof    | `RejectExecutionStart` selects Start Rejection Containment or existing interruption owner        |
| provisioning loss before start exists                               | activation/revocation facts plus deterministic no-start/no-process evidence       | `DetectExecutionLoss`/provider command selects Pre-Start Admission Loss or existing interruption |
| start deadline                                                      | receipt inbox cursor and verified observed/receive times                          | `RecordExecutionStartDeadlineElapsed` records time only; WF-230 verifier decides winner/loss     |
| `BlockExecution` or loss after start may exist                      | delivery for exact `RunnerContainmentRequest`                                     | Runner checkpoints and stops/quarantines exact registration/worktree                             |
| `ReconcileRunnerContainment`                                        | `containment_confirmed` plus grant/tunnel disposition refs                        | WF-230 alone releases when every proof is present                                                |
| `DetectExecutionLoss`                                               | one detector epoch from disconnect/lease/key/capability/Lease Enforcer evidence   | exact credential-provisioning versus start-pending/started branches remain unchanged             |
| Runner reconnect                                                    | signed `reconciliation_observation`                                               | no lane change, resume, or old lease resurrection                                                |
| `ResolveOrSupersedeBlock`                                           | safe containment/reconciliation proof                                             | returns only to Todo/Backlog per WF-230, never directly In Progress                              |
| continuation                                                        | new explicit `ClaimAndStart` after durable containment                            | new Claim Attempt, lease, fence, nonce; may adopt verified worktree/checkpoint                   |

Runner Protocol may record authenticated evidence that loses a race, but it labels it stale/rejected
and preserves it in the Runner ledger. It cannot reverse a winning fence/containment transaction.

## Local Lease Enforcer, partition, and crash contract

Database fencing prevents future receipts from being authoritative; it does not stop a process that
still has filesystem/network access. Every execution-capable Runner therefore has a minimal **Lease
Enforcer** outside both the vendor harness and the main Runner daemon. It is independently
supervised by the OS and owns the kill-capable cgroup/job/scope or equivalent containment handle. A
platform is execution-eligible only when its Adapter probe proves this fail-closed boundary; a
daemon timer or in-process heartbeat alone is insufficient.

The connection ceremony also completes a signed NTP-style exchange directly with the independently
supervised Enforcer, relayed but not authored by the Runner daemon. An existing enrollment completes
it before becoming `Current`; a first enrollment completes it only after the bounded
`DiagnosticsBootstrap` capability submission has proved and admitted the Enforcer outcome key. The
probe/echo/accept frames are the only post-submission bootstrap frames, and acceptance atomically
promotes the epoch; no capability result or execution order precedes them. Its persisted
`timeAnchorId` binds server send/receive instants, Enforcer monotonic receipt/send counters, probe
nonce, the exact signed time policy and digest, a policy-capped conservative
`transportUncertaintyMs`, and expiry. `timePolicy` is the closed object
`{ timePolicyVersion, maxTimeAnchorRoundTripMs, fixedTransportMarginMs, maxTransportUncertaintyMs, maxClockDriftPpm, maxAnchorAgeMs }`;
every value after the version is a canonical unsigned-decimal millisecond/count string under its
configured narrower range. `timePolicyDigest` is
`SHA256(UTF8("opzava.runner.time-policy.digest.v1\0") || RFC8785(timePolicy))`. Let
`serverRoundTripMs=unixMs(serverReceiveAt)-unixMs(serverSendAt)`. It must be nonnegative and no
greater than `timePolicy.maxTimeAnchorRoundTripMs`; otherwise no anchor is issued. The accepted
value is exactly `transportUncertaintyMs=serverRoundTripMs+timePolicy.fixedTransportMarginMs` and
must not exceed `timePolicy.maxTransportUncertaintyMs`, using checked arithmetic. Execution cannot
arm/renew without a current anchor.

The three closed schemas are exact:

- `runner.time_anchor_probe` is exactly
  `{ protocolVersion, messageKind:"runner.time_anchor_probe", timeAnchorId, runnerId, enrollmentEpoch, connectionEpoch, transcriptHash, enforcerKeyId, probeNonce, serverSendAt, timePolicy, timePolicyDigest, serverTimeAnchorKeyId, probeSignature }`.
- `runner.time_anchor_echo` is exactly
  `{ protocolVersion, messageKind:"runner.time_anchor_echo", timeAnchorId, runnerId, enrollmentEpoch, connectionEpoch, transcriptHash, enforcerKeyId, probeNonce, serverSendAt, enforcerMonotonicAtReceiptMs, enforcerMonotonicAtSendMs, enforcerWallObservedAt, timePolicyDigest, echoSignature }`.
- `runner.time_anchor_accepted` is exactly
  `{ protocolVersion, messageKind:"runner.time_anchor_accepted", timeAnchorId, runnerId, enrollmentEpoch, connectionEpoch, transcriptHash, enforcerKeyId, probeNonce, serverSendAt, enforcerMonotonicAtReceiptMs, enforcerMonotonicAtSendMs, enforcerWallObservedAt, serverReceiveAt, transportUncertaintyMs, timePolicy, timePolicyDigest, anchorExpiresAt, serverTimeAnchorKeyId, acceptedSignature }`.

No signature from an earlier object is embedded in a later schema; no other field is allowed.

The purpose-authorized `serverTimeAnchorKey` from the pinned trust bundle signs
`UTF8("opzava.runner.time-anchor-probe.v1\0") || RFC8785(probeWithoutSignature)` and
`UTF8("opzava.runner.time-anchor-accepted.v1\0") || RFC8785(acceptedWithoutSignature)`; the admitted
Enforcer outcome key signs
`UTF8("opzava.runner.time-anchor-echo.v1\0") || RFC8785(echoWithoutSignature)`. All three bind
Runner/enrollment/connection epoch, negotiated transcript hash, anchor ID, probe nonce, and their
respective server/Enforcer-monotonic timestamps. The Enforcer captures both counters from its own
clock and verifies the accepted echo values, policy object/digest, exact round-trip plus
fixed-margin calculation, and cap before persisting; the daemon cannot supply or rewrite them.
Replay, changed timestamp/policy, wrong Enforcer key, missing response, policy-limit violation, or
another connection epoch rejects the anchor.

The Lease Enforcer verifies the server-signed control lease/fence generation against the pinned
command trust bundle and translates authority to a local monotonic deadline using that current
anchor. The Runner daemon cannot extend it with an unsigned local message. Daemon loss arms
containment immediately. A bounded restart grace permits a restarted daemon only to authenticate,
checkpoint, relay Enforcer evidence, and complete the already-armed containment; it cannot cancel
containment, renew authority, launch, use a grant, or continue the old execution. Any later work
uses fresh WF-230 claim/lease/fence/nonce/start authority. If connection/renewal is lost,
key/enrollment or command trust is revoked, capability becomes invalid, the server issues a higher
fence, or the daemon cannot re-establish containment supervision, the Lease Enforcer must:

1. reject new tool/start/grant/tunnel operations under the old authority;
2. durably mark containment intent and the last known receipt cursor;
3. request exactly one bounded checkpoint from the Harness Supervisor and journal either
   `checkpoint_recorded` or `checkpoint_not_recorded`; a failure outcome never delays later steps;
4. remove local lease grants and close local preview delivery;
5. stop the registered process group and known descendants, or quarantine the process plus worktree,
   containers, ports, and grants when stop cannot be proven;
6. journal signed safe outcomes for replay after reconnect.

Execution Admission is the only authority that creates Enforcer authority; Runner Protocol merely
delivers it. Each admitted Lease Enforcer has a purpose-scoped Ed25519 outcome key registered by the
challenge-bound capability ceremony. This is software key-possession evidence, not hardware
attestation. The Enforcer itself—not the daemon or Harness Adapter—verifies these signed Semantic
Runner Orders and durably signs the corresponding outcome:

| Order                  | Required authority fields                                                                                                                                                                                                                                                                        | Exact accepted outcome                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `arm_lease_enforcer`   | lease/fence/claim, `enforcerAuthoritySequence="1"`, fresh 256-bit `enforcerAuthorityNonce`, one pre-issued `autonomousContainmentId`, containment registration/handle digest, `authorityIssuedAt`, `authorityNotAfter`, `authorityDurationMs`, current time-anchor/policy/command-trust versions | persist authority/order hash before grants or spawn, derive the conservative monotonic deadline, return `lease_enforcer_armed`                   |
| `renew_lease_enforcer` | same lease/fence, next contiguous authority sequence, fresh nonce, previous accepted authority-order hash, new issue/not-after/duration and current time anchor bounded by the current server lease                                                                                              | atomically persist the new order/deadline and return `lease_enforcer_renewed`; daemon heartbeat alone cannot renew                               |
| `fence_lease_enforcer` | named lease, strictly newer fencing token or current-token terminal fence, next contiguous authority sequence, fresh nonce, previous accepted order hash, containment-request ID/reason                                                                                                          | atomically make the authority non-renewable, begin containment, and return `lease_enforcer_fenced`; later stop/quarantine proof remains separate |

At receipt monotonic time `m`, the Enforcer computes:

```text
anchorAgeMs = m - anchor.enforcerMonotonicAtReceiptMs
elapsedUpperMs =
  (anchorAgeMs * 1000000 + (1000000 - anchor.timePolicy.maxClockDriftPpm) - 1) div
    (1000000 - anchor.timePolicy.maxClockDriftPpm)
conservativeServerNowUpper =
  unixMs(anchor.serverSendAt) + elapsedUpperMs + anchor.transportUncertaintyMs
remainingMs = min(
  authorityDurationMs,
  unixMs(authorityNotAfter) - conservativeServerNowUpper
)
localMonotonicDeadline = m + max(0, remainingMs)
```

All operands are nonnegative integers; `div` is integer floor division and the numerator implements
exact ceiling division for a clock that may run slow by the signed drift bound. RFC 3339 instants
are converted to Unix milliseconds before subtraction. Implementations use checked 128-bit-or-wider
intermediates and reject overflow. `anchorAgeMs` uses the Enforcer's own monotonic clock, must be in
`0..anchor.timePolicy.maxAnchorAgeMs`, and `timePolicy.maxClockDriftPpm` must be in `0..999999`.
Every decimal string is parsed into checked unsigned integer arithmetic only after canonical-string
validation; no binary float or JSON number participates. An expired/mismatched anchor, monotonic
regression, anchor age above the exact maximum, nonpositive remaining time,
time-policy/round-trip/uncertainty mismatch, regressed not-after, overflow, or deadline later than
the order/server lease bound rejects arm/renew and contains. Renew may extend only after the
contiguous signed order is durably accepted; the prior deadline remains effective until then.

The nested Enforcer outcome is a closed object with exactly `protocolVersion`,
`messageKind="runner.enforcer_outcome"`, `outcomeKind`, `runnerId`, `enrollmentEpoch`,
`enforcerKeyId`, `leaseId`, `fenceToken`, `claimAttemptId`, `authorityCommandId`,
`authoritySemanticCommandHash`, `enforcerAuthoritySequence`, `enforcerAuthorityNonce`,
`previousAuthorityOrderHash`, `containmentHandleDigest`, `result`, `dispositionDigest`,
`observedAt`, `enforcerOutcomeDigest`, and `enforcerOutcomeSignature`. `outcomeKind` is exactly
`armed`, `renewed`, or `fenced`. `result` is exactly one of:

- `{ kind:"authority_accepted", timeAnchorId, derivedMonotonicDeadlineMs, remainingAuthorityMs }`
  for an accepted arm/renew;
- `{ kind:"fence_accepted", containmentRequestId }` for an accepted authority-reducing fence, which
  requires no valid time anchor;
- `{ kind:"rejected_stale", safeReasonCode }`; or
- `{ kind:"contained_on_invalid_authority", containmentRequestId, safeReasonCode }`.

No deadline/time-anchor field exists in a fence/rejected/contained result. Arm uses
`SHA256(UTF8("opzava.runner.no-prior-enforcer-authority.v1\0"))` as `previousAuthorityOrderHash`;
renew and fence use the immediately prior durably accepted Enforcer authority Semantic Runner
Order's `semanticCommandHash`. The field is never null or absent. It uses:

```text
dispositionDigest = SHA256(
  UTF8("opzava.runner.enforcer-disposition.digest.v1\0") ||
    RFC8785({ outcomeKind, result })
)
enforcerOutcomeBody = enforcerOutcome_without(
  enforcerOutcomeDigest, enforcerOutcomeSignature
)
enforcerOutcomeDigest = SHA256(
  UTF8("opzava.runner.enforcer-outcome.digest.v1\0") ||
    RFC8785(enforcerOutcomeBody)
)
enforcerOutcomeSignature = Ed25519.sign(
  registeredEnforcerOutcomeKey,
  UTF8("opzava.runner.enforcer-outcome.signature.v1\0") ||
    RFC8785(enforcerOutcome_with_digest_without_enforcerOutcomeSignature)
)
```

Golden vectors cover accepted/stale/collision/gap outcomes, exact duplicate replay, and
time-anchor/expiry boundaries.

An ordinary Enforcer arm/renew/fence Semantic Runner Fact carries the independently signed Enforcer
outcome object and is itself signed by the authorized Runner enrollment key. An autonomous
authority-reducing fence fact instead uses the admitted Enforcer outcome key as its fact signer and
the independent autonomous sequence/source. A current-connection transport frame embeds either
unchanged fact and binds `connectionEpoch` plus negotiated transcript under the current Runner key.
The server verifies outer current-path authority, the selected inner fact signer, and the nested
registered Enforcer outcome key; daemon relaying/reframing cannot edit or invent the independent
outcome.

The Enforcer journal has uniqueness on
`(runnerId, enrollmentEpoch, leaseId, enforcerAuthoritySequence)` and on each authority nonce. The
same sequence/nonce/canonical order hash returns the original signed outcome. The same sequence or
nonce with another hash is tamper and immediately fences/contains. A lower sequence, older fence, or
expired order is a signed stale rejection and cannot alter the deadline; a sequence gap or
mismatched previous-order hash enters containment because the Enforcer cannot assume the missing
authority was only a renewal. An arm against an already armed different containment handle is a
collision. An exact duplicate does not mint a result with another disposition: it returns the
byte-identical original signed `authority_accepted`, `fence_accepted`, or rejection object. No
rejected/duplicate order moves a Card, releases capacity, or proves a process stopped; Execution
Admission consumes verified outcomes and retains every workflow decision.

The Lease Enforcer never grants itself additional offline execution. A short grace only permits the
bounded checkpoint/contain sequence; it is not a hidden lease extension. If the Lease Enforcer
itself dies, the pre-established OS containment primitive must stop the child tree or keep it in a
non-networked, non-writable quarantine before the OS supervisor restarts the Enforcer. The Runner
daemon refuses launch/renewal while Enforcer health, current containment-handle ownership, and
durable journal continuity are unproved. If both daemon and Enforcer fail or the OS primitive cannot
prove containment, the server state remains `execution_unknown`; capacity, worktree, and grants are
not released.

Crash windows:

| Crash/race                                                 | Contract                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Before durable spawn marker                                | signed no-action rejection may be admitted; no process-start claim                                                                               |
| After marker, before spawn                                 | reconciliation sees launch reservation; treat as ambiguous unless Supervisor proves no process/descendant                                        |
| After spawn, before `execution_started` delivery           | process exists; disconnect/loss becomes Blocked / Execution Unknown, never Start Rejection Containment                                           |
| Receipt sent, server commit unknown                        | Runner replays exact sequence/digest; server dedupes and WF-230 arbitration decides                                                              |
| Daemon restarts while child lives                          | new boot incarnation starts in containment-only mode, discovers registered/orphan descendants, and sends observation; no automatic attach/resume |
| Daemon dies while Lease Enforcer lives                     | Enforcer immediately arms containment; restart grace permits evidence/checkpoint/containment handoff only, never old-authority continuation      |
| Lease Enforcer dies while daemon/child live                | OS fail-closed containment stops or quarantines child; daemon blocks all launch/renewal until independent supervision is proved                  |
| Daemon and Lease Enforcer die                              | OS containment acts; absent proof, server preserves execution unknown and retains capacity/worktree/grants                                       |
| Server and Runner disagree on capacity                     | server admission wins; Runner may lower safe capability and reject start, never create extra slots                                               |
| Old socket survives new connection                         | connection epoch rejects all old-socket authority                                                                                                |
| Stop signal succeeds but descendants/container/port remain | containment is not confirmed; quarantine/unknown remains and capacity is held                                                                    |

If the host is powered off, the server cannot obtain a local checkpoint. It preserves the last
trusted checkpoint or explicit `execution_unknown`, fences/revokes, creates the branch-accurate
Slack summary, and waits for reconciliation. It never claims the work safely stopped merely because
the socket disappeared.

## Repository, worktree, and process containment

### Repository binding

V1 has one approved Opzava repository. Runner enrollment/config records its canonical repository ID,
normalized remote identity, expected `.git` common directory, approved worktree root, and allowed
base refs. Before every launch/reconcile the Supervisor:

- resolves real paths and verifies the repository/common-dir identity;
- rejects symlink escape, `..`, NUL/encoding tricks, a different remote, unexpected submodule or
  nested repository, worktree outside the root, and branch/worktree collision;
- serializes repository-wide `git worktree add/remove/prune` mutations while allowing independent
  processes in already-created worktrees;
- fetches/observes GitHub state and publishes refs only through the #231-owned trusted Git transport
  broker; Runner observations never become provider truth;
- binds exact base ref/SHA, branch ref, worktree generation, HEAD, dirty-state digest, and artifact
  refs. A path string alone is not identity.

Neither a local nor cloud Runner receives a GitHub App installation token, repository Contents-write
credential, deploy key, or equivalent write authority in its environment, grant set, worktree, or
vendor harness. To publish, raw immutable object-bundle bytes first enter the signed/scanned
artifact ingress below. The Runner then submits only the admitted artifact reference/digests plus
repository, exact ref, expected old SHA, proposed new SHA, lease/fence/contract/worktree identity,
commit/object manifest, and command nonce through ref-only WSS to #231's trusted Git transport
broker. That broker fetches and independently re-hashes the artifact, then reauthorizes current
provider health/permissions and expected ref state, transfers/verifies the exact objects, performs
the conditional ref update with server-held credentials, and records native GitHub facts. A
rejection or old-SHA conflict is a provider/synchronization fact, never permission for Runner-side
force push.

The #231 handoff is explicit and typed, with a prior server-owned artifact-admission stage.
Execution Admission first emits `prepare_object_bundle_upload`, binding one
`artifactAdmissionId`/`uploadNonce` and publication ID/nonce to tenant/repository, exact
lease/fence/Ready Contract/worktree/process registration, allowed ref, old/new commit/tree SHAs,
object-manifest digest, scan policy, maximum bytes, and expiry. The Harness Supervisor—not the
model/vendor process—creates the canonical bundle and may perform a fail-fast local scan, but that
scan is advisory only. It uploads the raw bytes to the Opzava artifact ingress with this closed
metadata request:

```text
{
  protocolVersion, messageKind: "runner.object_bundle_upload", artifactAdmissionId,
  uploadNonce, runnerId, enrollmentEpoch, leaseId, fenceToken, worktreeGeneration,
  publicationPreparationId, publicationNonce, exactRef, expectedOldSha,
  proposedNewSha, proposedTreeSha, objectManifestDigest, objectBundleDigest,
  safeSizeBytes, runnerScanResultDigest, uploadedAt, runnerUploadSignature
}
```

The Runner signature uses the current enrollment key and domain
`opzava.runner.object-bundle-upload.v1\0` over the request without its signature; the HTTP body
SHA-256 must equal `objectBundleDigest`. Opzava artifact ingress independently computes size/media
and object-graph results and runs the server-approved scanner over the received immutable bytes; it
never trusts `safeSizeBytes` or `runnerScanResultDigest` as admission evidence. One transaction
verifies current authority, exact order equality, the independently computed results, nonce/expiry,
and tenant-owned immutable object storage, then creates an **Object Bundle Artifact Admission**.
That closed record contains exactly `artifactAdmissionId`, `tenantId`, `repositoryId`, `runnerId`,
`enrollmentEpoch`, `leaseId`, `fenceToken`, `worktreeGeneration`, `publicationPreparationId`,
`publicationNonce`, `exactRef`, `expectedOldSha`, `proposedNewSha`, `proposedTreeSha`,
`objectManifestDigest`, `objectBundleDigest`, `objectBundleArtifactRef`, `scanPolicyVersion`,
`scannerIdentityDigest`, `ingressScanResultDigest`, `ingressObjectGraphDigest`, `ingressSizeBytes`,
`storedAt`, `availableUntil`, and `artifactAdmissionDigest`. The digest uses
`opzava.runner.object-bundle-artifact-admission.digest.v1\0` over the record without its digest.
Exact upload replay returns the same admission; changed bytes/metadata is collision.

Every upload attempt receives one server-signed closed response. Success is
`{ kind:"admitted", artifactAdmissionId, objectBundleDigest, artifactAdmissionDigest, objectBundleArtifactRef, safeReasonCode:"none", serverArtifactReceiptKeyId, artifactReceiptDigest, artifactReceiptSignature }`;
failure is
`{ kind:"rejected", artifactAdmissionId, objectBundleDigest, rejectionKind, safeReasonCode, serverArtifactReceiptKeyId, artifactReceiptDigest, artifactReceiptSignature }`,
where `rejectionKind` is exactly `oversize`, `media_disallowed`, `object_graph_invalid`,
`secret_suspected`, `policy_disallowed`, `authority_stale`, or `malformed`. The digest/signature use
`opzava.runner.object-bundle-artifact-receipt.digest.v1\0` and
`opzava.runner.object-bundle-artifact-receipt.signature.v1\0` with the server's connection-control
key, removing `artifactReceiptDigest` and then `artifactReceiptSignature` in the standard two-stage
construction. A rejection exposes no scanner match, path, content, object name, or raw error and
creates no artifact ref. The Runner journals the response as safe evidence; only the admitted
variant can be repeated in `prepare_exact_ref_publication`.

Only after that admission is durable and available long enough for broker transfer does Execution
Admission emit `prepare_exact_ref_publication`, repeating the admitted artifact/ref/digests and
binding current authorization/policy plus expiry. The Runner responds on the current authenticated
WSS connection with an `exact_ref_publication_submission` Semantic Runner Fact inside a signed
current-connection frame, repeating those exact values plus the preparation command ID/hash and
`submissionDigest`. Runner Protocol verifies the outer current connection, inner enrollment
signature/fact sequence, and equality bindings, then atomically writes an authenticated handoff
row/outbox message addressed to #231's Git transport broker. It does not call GitHub or reinterpret
the bundle.

```text
exactRefSubmissionBody = exactRefPublicationSubmissionPayload_without(submissionDigest)
submissionDigest = SHA256(
  UTF8("opzava.runner.exact-ref-publication-submission.digest.v1\0") ||
    RFC8785(exactRefSubmissionBody)
)
```

`publicationPreparationCommandId` and `publicationPreparationSemanticCommandHash` must equal the
fact's source-binding command identity. The submission's `publicationPreparationId`,
`publicationNonce`, ref, SHAs, manifest digest, and bundle digest/artifact ref must equal the
accepted preparation order. That preparation must still be unexpired; its expiry is inherited from
the order and therefore is not duplicated in the fact payload. The artifact content digest must
equal `objectBundleDigest`, and `artifactAdmissionId` must resolve to the exact current immutable
admission. The artifact service grants #231's broker read-once access by admission ID over an
internal tenant-bound service identity; the Runner-local ID/path is never accepted. The broker
streams and re-hashes bytes before object import. Admission expiry is extended transactionally only
for the same publication attempt, and retention/deletion cannot remove bytes while the handoff is
pending or provider result is unknown.

The same `(publicationPreparationId, publicationNonce, factDigest)` returns the original handoff
result; another fact digest is a collision. Stale lease/fence, wrong ref/SHA/object graph, expired
nonce, revoked Runner, unhealthy GitHub integration, or authorization drift rejects the handoff. The
#231 broker reauthorizes current provider permission and old-ref state, imports/verifies the exact
objects, and conditionally updates the ref using server-held credentials. Its accepted/rejected
provider result is a GitHub/synchronization fact; the Runner submission is never proof of
publication, PR, checks, merge, or permission to force-update.

Each claim attempt gets a unique `worktreeGenerationId` and deterministic branch namespace derived
from safe DevTicket/attempt IDs. Existing branch/worktree adoption is forbidden unless WF-230 has
released prior containment and the fresh claim explicitly binds the exact reconciled generation,
HEAD, dirty digest, and checkpoint lineage.

### Process registration

Process identity is reserved before grants or spawn, eliminating the cycle in which a grant would
need a registration that did not yet exist:

1. Execution Admission reserves only opaque grant requests under the Claim Attempt and sends
   `prepare_execution_registration`, bound to the exact lease/fence/contract/worktree and selected
   Harness Adapter/tool/version/mode. It contains named secret refs/versions and intended purposes,
   never values or active grant handles.
2. The Supervisor creates the worktree/containment reservation and durably records `spawn_reserved`;
   no child, vendor session, grant activation, or preview exists. It returns signed
   `process_registration_reserved` with process registration ID/version, launch-attempt ID,
   continuation binding, the typed Adapter plan and digest, the exact named-secret reservation list
   and digest, worktree/HEAD, intended process-group/job/cgroup/container handle digest, realized
   resource reservations, and a durable `no_process_started=true` marker.
3. The server accepts that receipt through the normal inbox, binds the Lease Credential Access
   Grants to the now-existing registration, and sends `arm_lease_enforcer`. Only an accepted
   `lease_enforcer_armed` outcome permits grant activation.
4. The server sends `activate_secret_grants` for the exact registration and opaque handles. The
   local/cloud grant Adapter returns one signed `secret_grants_activated` receipt covering every
   required handle, injection destination, expiry and disposition cursor, or a signed
   `secret_grant_activation_failed` receipt with stable safe reason/per-handle disposition. Partial
   activation is failure and triggers disposal; neither outcome contains a value. A zero-grant claim
   still receives this order and must return `secret_grants_activated` with empty activated- handle
   and broker-binding arrays; the signed activation-outcome digest body also includes the empty
   disposition array under the canonical empty-set `grantSetDigest`.
5. Spawn remains structurally impossible until Execution Admission has accepted registration,
   Enforcer-arm, and the typed activation receipt (empty or all-required-grants-active), then emits
   one `start_execution` order binding those accepted semantic-fact digest values and the same
   process registration/launch attempt. Duplicate start delivery returns the journaled original
   disposition.

Before spawn the Supervisor therefore durably records:

- process registration ID/version and launch-attempt ID;
- typed Adapter plan and its digest, never a generic command string;
- executable/Adapter/version/mode identity;
- worktree generation, branch/HEAD, exact policy and secret-grant handles;
- intended OS process-group/job/cgroup/container isolation and resource/port reservations;
- `spawn_reserved` with no claim that a child exists.

Only after the exact process group is created, attached to containment, and observed working may it
journal/send `execution_started`. Checkpoints include safe state/digests and artifact refs; raw
diffs/tool output remain in bounded local/object-store artifacts under retention and secret scans,
not in the Runner or Card ledgers.

Containment covers the process group and descendants, vendor helper processes, containers, bound
ports/tunnels, file locks, worktree, and lease grants. PID alone is insufficient because it can be
reused. Confirmation binds registration version, process start identity, group/job/cgroup, and
observed terminal/quarantine disposition.

## Secret and credential contract

### Authority chain

```text
Ready-approved Named Secret Reference
  → server-owned reservation under Claim Attempt
    → accepted pre-spawn Process Registration + Enforcer arm
      → Lease Credential Access Grant bound to exact registration
        → opaque grant handle delivered to exact Runner/process purpose
      → local/cloud grant Adapter obtains the value without returning it to Opzava
          → signed activation or safe failure receipt
            → local disposition confirmation
              → optional separate upstream credential revocation confirmation
```

The reservation binds tenant, named reference/version, Ready Contract/hash, Claim Attempt, lease,
fence, and Runner/enrollment epoch. Only after the accepted pre-spawn registration does the grant
add process registration/launch attempt, exact purpose/scope, injection method, allowed destination,
local/cloud eligibility, issue/expiry times, and one-use or bounded-use policy.

Rules:

- A Runner cannot enumerate vault refs. It can redeem only exact handles already reserved by
  Execution Admission from the Ready allowlist.
- Tool-vendor logins (Codex OAuth, Anthropic login, etc.) remain in the Runner's native local/cloud
  credential store. Opzava receives only capability/auth-health and expiry reason codes; it never
  uploads, mirrors, or converts those logins into Card secrets.
- An agent Harness, its shell/tool process, and every descendant receive only the opaque grant
  handle and a purpose-specific typed broker capability; they never receive the raw value through an
  inherited descriptor, socket response, environment variable, argv, readable file/path, prompt,
  model context, committed configuration, or result payload.
- The **Lease Secret Broker** runs outside the Harness process tree under a distinct OS
  identity/namespace and resolves the value itself. The Harness namespace may connect only to a
  dedicated **non-secret-bearing IPC endpoint** using the opaque capability. The Broker verifies OS
  peer identity, containment identity, exact process registration, capability purpose, nonce, and
  expiry on every request; exposes only allowlisted typed operation/destination schemas; and returns
  safe operation results rather than credentials. Its vault descriptors, secret-bearing sockets,
  files, and mounts are separate from that request endpoint, close-on-exec where applicable, and
  never readable or mountable by the Harness namespace. `ptrace`, `/proc` cross-read, process-memory
  read, endpoint impersonation, and capability forwarding to another process must be denied by the
  containment profile.
- A separately isolated non-agent consumer may receive a value only under a future purpose-specific
  exposure contract and separate process identity. If a required tool or arbitrary command can work
  only by receiving the raw secret, that execution mode is unsupported in v1 and cannot pass Ready;
  Human approval cannot waive the secret-exposure Absolute Stop.
- The Harness Supervisor scrubs child output and scans bounded outputs, patch/diff, commits,
  checkpoints, evidence candidates, errors, and outbound frames for a canary/fingerprint policy.
  Suspected exposure invokes the existing Absolute Stop; it is not “fixed” by redacting only the UI.
- Local cache/file/socket/descriptor cleanup and upstream provider credential revocation are
  distinct facts. `local_grant_disposition_observed` never claims the underlying secret was
  rotated/revoked. A secret-exposure stop may require both; an ordinary fence normally removes only
  the derived lease grant.
- Cleanup failure retains containment, capacity, and worktree under the owning WF-230 lifecycle.
  Reboot or disconnect cannot infer cleanup.
- Slack, Ask Admin, MCP, Card, GitHub, Docs, activity, worklog, Runner ledger, synchronization
  ledger, evidence, preview URL, and notification payloads contain only safe names/opaque refs,
  health, version, and reason codes.

Named secret policy includes `local_only` or `cloud_eligible`. A cloud Runner cannot claim work
whose required grant is local-only. Changing this classification is a secure-UI, versioned
contract/policy change, not a Slack approval.

### Lease Secret Broker IPC

Each grant reservation creates a Broker capability in `reserved`. Accepted registration, Enforcer
arm, and grant activation atomically bind it to tenant, Runner/enrollment, lease/fence, process
registration/version, launch attempt, containment peer identity, grant handle/purpose,
operation/destination policy, expiry, and `usePolicy` (`one_use` or `bounded_use`) before moving it
to `active`. The exact lifecycle is `reserved -> active -> consumed|expired|revoked -> disposed`,
with the additional pre-activation paths `reserved -> expired|revoked -> disposed`; a bounded-use
capability may remain `active` only while its committed use count is below `maxUses`. `consumed`,
`expired`, and `revoked` are terminal authorization states, and `disposed` records verified local
capability-token and derived-credential destruction. Reboot/disconnect never moves a capability
forward by inference.

The Broker creates a random 256-bit `brokerCapabilityToken` and delivers it only through the
containment-bound non-secret IPC bootstrap; it is an opaque local bearer/MAC key, not the named
secret value. It is forbidden from logs, Runner frames, Cards, artifacts, and server persistence.
The Harness can use it only to authenticate this closed request:

```text
{
  protocolVersion, messageKind: "runner.secret_broker_request", requestId,
  brokerCapabilityId, processRegistrationId, processRegistrationVersion,
  launchAttemptId, requestSequence, requestNonce, operation,
  destinationBinding, requestBody, requestDigest, capabilityProof
}
```

`operation` has exactly one v1 variant:
`{ kind:"authenticated_provider_request", method, pathTemplateId }`, where `method` is exactly
`GET`, `POST`, `PUT`, `PATCH`, or `DELETE` and `pathTemplateId` selects a server-approved fixed
template rather than carrying a URL. `destinationBinding` is exactly
`{ kind:"provider_connection", providerConnectionId, operationPolicyId }`; arbitrary host, port,
scheme, redirect, proxy, DNS target, header, executable, shell, or path text is forbidden.
`destinationBindingDigest` in the activation fact is
`SHA256(UTF8("opzava.runner.secret-broker-destination.digest.v1\0") || RFC8785({ operation, destinationBinding }))`.
`requestBody` is exactly `{ kind:"none" }` or `{ kind:"safe_artifact", artifactRef }`, where
`artifactRef` has the same closed four fields as an `artifactRefs[]` item, passed prior Secret-Safe
Ingress, and is permitted by the selected operation policy. The request construction is:

```text
secretBrokerRequestBody = request_without(requestDigest, capabilityProof)
requestDigest = SHA256(
  UTF8("opzava.runner.secret-broker-request.digest.v1\0") ||
    RFC8785(secretBrokerRequestBody)
)
capabilityProof = HMAC-SHA256(
  brokerCapabilityToken,
  UTF8("opzava.runner.secret-broker-request.proof.v1\0") ||
    RFC8785(request_with_digest_without_capabilityProof)
)
```

The Broker returns exactly:

```text
{
  protocolVersion, messageKind: "runner.secret_broker_response", requestId,
  brokerCapabilityId, requestSequence, requestDigest, disposition,
  safeStatusCode, result, safeReasonCode, brokerReceiptDigest,
  brokerResponseProof
}
```

`disposition` is exactly `succeeded`, `denied`, `expired`, `revoked`, `failed_safe`, or `unknown`.
`safeStatusCode` is exactly `success_2xx`, `accepted_202`, `client_error_4xx`, `server_error_5xx`,
or `not_observed`, not a raw provider code or free text. Provider status 202 maps only to
`accepted_202`; another 2xx maps to `success_2xx`. `result` is exactly `{ kind:"none" }` or
`{ kind:"safe_artifact", artifactRef }`; a result artifact is bounded, scanned, redacted, and
contains neither credential material nor an unapproved provider response. The response construction
is:

```text
secretBrokerResponseBody = response_without(brokerReceiptDigest, brokerResponseProof)
brokerReceiptDigest = SHA256(
  UTF8("opzava.runner.secret-broker-response.digest.v1\0") ||
    RFC8785(secretBrokerResponseBody)
)
brokerResponseProof = HMAC-SHA256(
  brokerCapabilityToken,
  UTF8("opzava.runner.secret-broker-response.proof.v1\0") ||
    RFC8785(response_with_digest_without_brokerResponseProof)
)
```

HMAC outputs use unpadded base64url. No response field can carry the secret or a credential-bearing
URL/header/cookie.

Before every operation the Broker verifies the IPC peer's OS/process/containment identity equals the
capability binding; state is `active`; expiry and use count permit the call; operation and
destination equal the bound policy; request nonce is fresh; request artifact is safe; and the MAC is
valid. `requestSequence` is a contiguous unsigned-decimal sequence per capability starting at `"1"`.
The same `(brokerCapabilityId, requestSequence, requestDigest)` returns the journaled response
without repeating the provider action; the same sequence or nonce with changed content is a
collision that atomically revokes the capability; a gap, stale sequence, forwarded capability,
redirect outside the bound destination, or peer mismatch is denied before secret resolution. The
Broker—not the Harness—resolves and injects the credential into the fixed outbound operation. Before
secret resolution or dispatch, one serializable transaction locks the capability and expected
sequence; rechecks every binding; writes the request identity/provider idempotency key; CAS-reserves
that request as `dispatch_reserved`; and atomically consumes `one_use` or increments `bounded_use`,
moving the capability to `consumed` when the reserved count reaches `maxUses`. Only the transaction
winner may resolve/inject and dispatch. A concurrent request therefore observes the reserved use or
terminal state and cannot also dispatch. A denial before this reservation consumes no use; every
reservation consumes one even when the provider later fails or becomes unknown.

After dispatch, a second transaction changes only that request from `dispatch_reserved` to its safe
terminal/unknown receipt; it never changes the already committed use count. A crash after
reservation is `unknown` and requires provider-safe reconciliation using the same request
identity/idempotency key; it never rolls back the use or dispatches under a new nonce. Derived
credential material is removed before responding. Activation and disposal Semantic Runner Facts
carry only the closed capability bindings/IDs and digests defined above. A broker crash before a
committed result is likewise `unknown` and never starts a new request automatically. A `consumed`
capability retains its protected MAC key and journal only until grant disposition/expiry so an exact
response-loss replay returns the original response; it authorizes no new sequence. `disposed`
destroys that key after the response and reconciliation records are durable and no retry remains in
flight.

## Slack Personal Assistant, Ask Admin, MCP, and OpenClaw

### Slack

An actionable Slack control is an opaque one-time token resolving server-side to one existing Opzava
approval/request row. The Adapter:

1. verifies the Slack request signature over the raw body, timestamp freshness, installation/team,
   workspace, and app identity;
2. maps the Slack user to the current enrolled Admin under the tenant and rechecks role/session or
   configured Slack identity binding;
3. before a success ACK, locks the server-owned action row and uses one short serializable
   transaction to CAS its exact `(actionTokenId,actionNonce)` from `Pending` to `Queued` for this
   provider interaction, while committing the provider delivery/interaction identity, verified
   installation/team/user mapping refs, request digest, dedupe disposition, and exactly one
   command-intent outbox row. Exact replay by either provider identity or action token returns the
   stored queued ACK; a distinct interaction for an already queued/consumed nonce creates no second
   outbox row and returns the terminal already-used result. It performs no long workflow work in
   this transaction;
4. returns success only after that commit. Exact provider/action replay returns the stored ACK and
   changed payload under either identity is collision. If the transaction cannot commit within the
   provider window, it returns retryable failure so Slack redelivers rather than losing the action;
5. the queued worker reloads exact target/version/hash/action/expiry/authorization and submits the
   same server command as the UI;
6. edits/sends only a safe result summary.

Replay, bad signature/time, wrong install/team/user, unmapped/revoked Admin, stale target/version,
expired/consumed nonce, role removal, or Absolute Stop fails closed. Free-text messages may discuss,
comment, shape Backlog, or create a Proposal/command intent, but phrases such as “yes” or “approve”
never become approval without the exact server-owned action token. OpenClaw native exec approvals or
message transcripts cannot substitute.

### Ask Admin

Ask Admin keeps PRD-005 conversation/session/capability authority. Its BFF derives the current web
principal; the broker transports an on-behalf-of assertion; the Dev Board Adapter must reauthorize
the original principal/source/session/role and exact command under the server's command envelope.
The provenance chain is:

```text
authenticated human → Ask Admin conversation/turn → tool-call ID → Dev Board command request
```

Turn and tool-call idempotency prevent duplicate requests. The Lead Orchestrator may recommend,
dispatch an allowed request, pause/escalate, or notify. It does not become the Human, assignee,
Runner, Reviewer, secret broker, or `operator.admin` merely because it called a tool. Machine
enrollment, raw secret entry, security/integration trust changes, and unbounded approvals stay in
the secure UI.

### MCP and OpenClaw

- An MCP link token authenticates a user/session/client command request and allowed tool scopes. It
  does not sign Runner Receipts, prove process/worktree state, select the Runner, or gain lease
  authority. A manually opened tool can request `ClaimAndStart`; only the enrolled Runner can later
  prove `execution_started`.
- The MCP link is created and revoked only through secure Opzava UI. The server stores only a hash
  of the random token plus tenant, Human principal, client identity, exact allowed tool names,
  issued/expiry/revocation state, and policy version. Each call binds that resolved authority to a
  caller-generated request ID and canonical argument digest. Exact replay returns the recorded
  result; the same request ID with another tool or digest is collision; expiry, revocation, role
  loss, scope mismatch, or cross-tenant use fails before a command-intent outbox row exists.
- MCP request identity is exactly `(tenantId,humanPrincipalId,clientIdentity,requestId)` across
  every link-token version for that same principal/client; token rotation, expiry, and revocation
  never reset the namespace. The idempotency row and terminal command/result digest are retained as
  a non-secret collision tombstone for the tenant's lifetime. Another tenant has a disjoint key; a
  different principal/client cannot read or replay the result. Per-principal/client rate and
  outstanding-request quotas are checked before row creation, and rejected over-quota IDs reserve no
  tombstone, preventing an unauthenticated/cross-tenant namespace exhaustion attack.
- One accepted MCP invocation can create at most one idempotent server command through the same
  public application-command seam as UI, Slack, and Ask Admin. Server-derived tenant, actor,
  DevTicket, Ready/version, and policy bindings override no caller field because those fields are
  forbidden in project arguments. The token and its hash never enter a Runner order, Card, log,
  evidence package, or model context.
- MCP server/skill/tool availability remains deny-wins policy. Project arguments never carry tenant,
  workspace, actor, Runner, or secret authority.
- OpenClaw Node, Device, ACP, CLI backend, session, run, and operator approval remain OpenClaw-owned
  facts behind the broker ACL. A physical machine can hold both OpenClaw and Runner identities, but
  pairing/enrollment, keys, scopes, health, and revocation remain independent.
- Browser code never receives Gateway operator/admin credentials, Runner private keys, enrollment
  setup grants after consumption, or raw secret values.

## Local Docker, preview, local/cloud, Sprint, and capacity boundaries

#232 owns only Runner-side capability observation and delivery/containment primitives:

- A local Runner may advertise a versioned `local_review_transport` capability with safe stack
  profile ID, expected-service health codes, Docker access mode, evidence-upload health, and preview
  transport support. It never self-authorizes Review or declares evidence valid.
- #229 selects the independent Reviewer, grants the exclusive shared-Docker Review lease, defines
  checks/evidence, and authorizes preview. #232 transports those future typed orders and reports
  health/disposition only.
- Preview uses a server-owned authorization exchanged through an authenticated browser flow; no
  bearer credential is embedded in a URL, Card, Slack message, or receipt. Runner
  delivery/revocation binds exact authority/build/expiry. Details remain #229-owned.
- A cloud Runner always reports `local_review_transport=false`. It may implement an exact commit,
  upload immutable raw bundle bytes only through signed/scanned artifact ingress, and submit the
  admitted artifact reference/digests plus signed old/new-SHA ref update through ref-only WSS to
  #231's trusted Git transport broker; it never receives repository write credentials or pushes
  directly. The separately enrolled local Reviewer then verifies the resulting exact SHA. Cloud
  cannot satisfy or bypass Review.

Both Runner types may advertise `managed_ordinary` and `managed_autonomous_serial`. Runner selection
is explicit in the claim/Sprint approval inputs. A local lease cannot migrate to cloud mid-flight;
after containment, a future item or fresh claim can select cloud only through the owning command and
policy. A cloud Runner never appears merely because the local machine went offline.

The Capability Manifest supplies only:

- a hard safe implementation maximum and resource/isolation facts;
- supported ordinary/Sprint modes and local/cloud grant classes;
- observed health, freshness, and versioned capability digest.

#233 owns Focused/Balanced/Custom selection and scheduling. Balanced is the configured default only
when the current effective capability safely supports two implementation leases. Otherwise the UI
requires explicit Focused selection before the Runner becomes admission-eligible; it never labels an
unsafe effective limit “Balanced.” Custom is bounded by the minimum of Runner-verified safe max,
platform policy max, and current resource policy. No capability permits a second Active Sprint or a
second concurrent Sprint DevTicket.

## Ledger ownership and retention handoff

| Fact                                                                                                                                                               | Ledger                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| enrollment/rotation/revocation decision, capability policy change                                                                                                  | Dev Board activity/audit plus Runner ledger ref                                 |
| command delivery, ACK/disposition, signed receipt verification/rejection, sequence/gap/collision, connection/heartbeat, process/worktree/checkpoint/reconciliation | Runner execution/checkpoint ledger                                              |
| accepted lane/assignment/approval/Blocked/Done command                                                                                                             | Dev Board activity/history ledger                                               |
| Slack/Ask Admin planning discussion and human decisions                                                                                                            | planning decision ledger or PRD-005 conversation authority, cross-linked safely |
| GitHub webhook/outbox/provider facts                                                                                                                               | synchronization/outbox/conflict ledger                                          |

Authoritative envelope hashes, lifecycle dispositions, fences, checkpoints relied upon, containment,
and reconciliation facts remain durable. High-volume stdout/stderr/tool telemetry and large local
artifacts have bounded retention defined finally by #235. Corrections append; they do not mutate a
receipt another command relied on.

## Sad paths and deterministic outcomes

| Scenario                                                        | Required outcome                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Enrollment grant replay with same proof                         | idempotent original result; no second Runner/key                                                                                         |
| Enrollment grant reused with different key/payload              | conflict/audit; no Active enrollment                                                                                                     |
| Local enrollment challenge expires or is replayed               | grant/challenge unusable; exact completion idempotent only; changed proof creates no enrollment                                          |
| Cloud issuer/audience/subject/deployment mismatches             | reject and consume nothing; token cannot select tenant or Runner                                                                         |
| Cloud token `jti` or grant replays with changed proof           | collision/audit; no second enrollment/key                                                                                                |
| Key rotation has gap, active authority, or unrecorded ACK       | reject cutover; replay/ACK/contain first; old epoch/key remains current and facts stay prune-safe                                        |
| Key rotation/recovery proof or token is replayed with changes   | collision/audit; no partial key epoch or second recovery                                                                                 |
| Connection proof replayed on another socket/challenge           | reject before epoch; audit replay; no old/current epoch mutation                                                                         |
| Negotiation transcript changes or client forces downgrade       | reject connection; no `connection_ready` or delivery                                                                                     |
| Key revoked while receipt is in flight                          | server receive/cutover order decides; after-cutover frame rejected and affected lease contained                                          |
| Connection epoch superseded while old socket remains            | old frames rejected even with valid key; no duplicate process action                                                                     |
| Runner reconnect cursor is ahead of server-confirmed cursor     | replay from server cursor; discrepancy/reconciliation; never skip delivery                                                               |
| Capability challenge/sequence replay or collision               | exact duplicate idempotent; changed hash/gap rejects and suspends new admission                                                          |
| Lease-free fact carries `receiptSequence` or wrong domain       | schema reject before signature admission; no invented lease or workflow fact                                                             |
| Capability manifest downgraded/expired after claim              | block new operations; invoke owning loss/containment path without pretending process stopped                                             |
| Managed-enforcement key rotates/revokes during work             | quiesced cursor-equal cutover or immediate containment; no overlapping decision authority                                                |
| Command delivered twice or ACK lost                             | Runner journal returns exact original disposition; one local action                                                                      |
| Command expires before an irreversible local action             | rejected no-action ACK; no grant/process/checkpoint/artifact effect                                                                      |
| Same command ID arrives with another hash/delivery ID           | protocol incident; connection suspended, active work contained                                                                           |
| Delivery ID remaps to another command/hash                      | protocol incident; connection suspended; command dedupe cannot be bypassed                                                               |
| Receipt duplicate                                               | same inner fact digest returns original inbox disposition                                                                                |
| Persistent fact replays after connection supersession           | unchanged inner fact digest in new outer frame; admit/dedupe from communicated family cursor                                             |
| Receipt sequence collision                                      | suspend authority and contain; never choose one payload silently                                                                         |
| Receipt gap/out-of-order                                        | hold pending/replay; later signed ACK revision closes in order or timeout becomes unknown                                                |
| Live fact-admission ACK is lost                                 | fact remains journaled; latest signed ACK snapshot replays before pruning or key rotation                                                |
| Start command received but daemon crashes before marker         | no-action only if exact reconciliation proves no registration/process; otherwise unknown                                                 |
| Process spawns before start receipt, then disconnects           | Blocked / Execution Unknown; never return Todo as rejected start                                                                         |
| Valid start receipt races timeout/fence                         | exact WF-230 ingress/cutoff/fence arbitration; loser remains evidence only                                                               |
| Signed start rejection races actual start                       | no-process proof must match journal; accepted start/process makes rejection stale                                                        |
| Process registration receipt is lost before grant activation    | replay exact registration; no second launch attempt/worktree/containment handle                                                          |
| Secret grant partially activates or activation fails            | signed failure + disposal; spawn forbidden; owning pre-start path retains work/grants                                                    |
| Enforcer arm/renew sequence collides or has a gap               | exact duplicate replays; collision/gap fences and contains; daemon cannot extend deadline                                                |
| Enforcer time anchor is stale/uncertain or delivery is late     | reject arm/renew and contain; monotonic deadline never exceeds server authority                                                          |
| Heartbeat arrives on fenced lease                               | liveness may be stored; no renewal or authority                                                                                          |
| Watchdog cannot kill a descendant/container                     | quarantine/unknown retained; no capacity/worktree/grant reuse                                                                            |
| Bounded checkpoint fails or deadline expires during containment | sign `checkpoint_not_recorded`, preserve the last trusted binding, then continue cleanup and stop/quarantine; never deadlock containment |
| Reconnect reports clean worktree but server knows newer fence   | old process/worktree remains containment evidence; fresh claim required                                                                  |
| Reconnect reports dirty/diverged/foreign remote                 | quarantine, safe summary, Human attention; no adoption/resume                                                                            |
| Local Runner disconnects during Sprint                          | pause/Blocked per #230/#233, Slack summary, no cloud failover                                                                            |
| Cloud Runner claims local-only secret or Review capability      | admission/command rejected; no value or Review fact                                                                                      |
| Local grant removed but upstream revoke pending                 | record local disposition only; owning lifecycle retains required confirmation                                                            |
| Secret canary appears in output/diff/frame                      | reject/quarantine before durable unsafe persistence and open Absolute Stop                                                               |
| Adapter requires interactive input or current policy denies     | typed governed outcome; Blocked/contain as phase requires; new Human command/policy version only                                         |
| Managed allow receipt is reused or arguments change             | invocation digest/use CAS rejects; no second forward; contain bypass                                                                     |
| Managed target ID/revision/scope is substituted                 | target-object equality/digest rejects before forward; contain any direct bypass                                                          |
| Concurrent Broker calls race the last permitted use             | one pre-dispatch reservation wins; loser never resolves secret or dispatches                                                             |
| Managed artifact is oversized or policy-disallowed              | typed safe rejection disposition; no artifact ref or unsafe content                                                                      |
| Exact-ref submission uses stale old SHA or altered objects      | #231 handoff/provider rejection; no force push and no publication fact                                                                   |
| Slack provider retries or uses a second interaction ID          | action-nonce CAS returns stored/used result and exactly one Opzava command/decision                                                      |
| Slack free text says “approve”                                  | discussion/intent only; no approval row consumption                                                                                      |
| Ask Admin model supplies another tenant/user/Runner ID          | ignored as authority; current server principal/policy decides                                                                            |
| MCP caller claims it is the Runner                              | request may be denied/accepted as actor intent; no Runner fact without enrollment signature                                              |
| MCP token rotates and request ID is reused with changed input   | principal/client namespace collision; no second command regardless of token version                                                      |
| OpenClaw Device/Node is healthy                                 | no implication that Runner enrollment/tool/worktree is healthy                                                                           |

## Deterministic future conformance plan

This research ticket specifies tests; it does not claim an unbuilt protocol passes them.

### 1. Golden-vector protocol suite

- Publish canonical outer transport-frame and inner Semantic Runner Fact bytes, SHA-256 digests,
  Ed25519 public keys/signatures, and expected parse result for every closed schema variant.
- Publish cross-language semantic-order and delivery-envelope fixtures showing the exact pre-hash
  object, RFC 8785 bytes, domain-prefix bytes, digest, signed-object bytes, and signature. Assert
  digest/signature fields are excluded from their own preimages and Node plus every supported Runner
  implementation produces byte-identical results.
- Include canonical/noncanonical vectors for unpadded base64url keys/signatures/nonces,
  `sha256:<lowercase-hex>` digests, absent-versus-null optionals, unsigned-decimal
  sequence/epoch/cursor strings, millisecond UTC timestamps, and the embedded `semanticOrder`
  object. Alternate encodings must reject before semantic admission.
- Flip bytes/fields; use wrong domain/direction/key/enrollment/connection/protocol/fence/nonce;
  duplicate keys; noncanonical numbers/Unicode; stale epochs; unsupported critical features;
  compression and body-limit violations.
- Prove exact duplicate, digest collision, sequence collision, gap, replay, and key-rotation cutover
  results.
- Publish local/cloud rotation-challenge, old/new-key proof, and recovery-proof vectors. Reject
  active-authority/gapped-cursor cutover, stale challenge, wrong proposed epoch, changed key/nonce,
  cloud-token replay, a locally journaled but unadmitted old-key fact/ACK, changed/fake journal
  freeze/high-water marks, and partial transaction outcomes.
- Publish server command trust-bundle and rotation vectors. Prove purpose separation, overlap,
  emergency revoke, highest-version persistence, root/key rollback rejection, changed-key/same-ID
  rejection, authenticated initial bootstrap transcript/root fingerprint confirmation, copied
  bootstrap rejection, exact consumed-completion response replay, enrollment-scoped version reset,
  ordered update-frame delivery/ACK, missing-link and wrong-scope rejection, and secure
  re-enrollment recovery.
- Publish Runner transport-frame/fact, capability probe/manifest/effective/admission, Enforcer-key
  proof, and nested Enforcer outcome vectors. Prove every self-exclusion, purpose key, family
  sequence, outer `frameDigest`, and inner `factDigest` collision result across languages.
- Publish challenge-defined probe/canary bodies and receipts, managed decision/invocation/use
  receipts, managed-enforcement quiescence order/report/freeze, fact-admission ACK snapshots and
  current-connection delivery frames, every process/no-action/no-spawn/start proof,
  rotation/recovery proof hashes, managed-artifact dispositions, and object-bundle ingress receipts.
  Prove all seven exact purpose keys, scalar adapter sort plus nested-array duplicate rejection,
  self-exclusions, replay/collision, monotone ACK revisions and `ackIssuedAt`, fact/ACK-signing/
  delivery enrollment equality rules, one-use, and safe rejection variants. Include the canonical
  registration-bound zero-grant `grantSetDigest` and success `reasonCode="none"` vector.
- Publish the exhaustive command-kind/fact-kind matrix, including zero-fact Registry/upload rows,
  multi-fact containment order with both checkpoint outcomes, zero-grant activation, and delivered/
  autonomous checkpoint request-ID equality. Reject every crossed kind, multiplicity, ordering, and
  request-ID vector; prove `checkpoint_not_recorded` still proceeds through cleanup and one terminal
  containment outcome.
- Publish exact time-anchor probe/echo/accepted and Enforcer deadline vectors at zero/max drift,
  zero/max anchor age, slow/fast monotonic clocks, round-trip/margin cap, overflow, expiry, and
  duplicate/collision boundaries. The derived deadline must never exceed server authority.
- Publish parser-limit boundary vectors for every byte, depth, member, string, feature, ref, and
  inventory limit. Reject one-over, compressed, fragmented-over-limit, unknown-field, and inline
  raw-artifact variants before signature admission. Include uint64 maximum/one-over, leading-zero,
  JSON-number, negative, exponent, and binary-float integer variants; only canonical decimal strings
  pass.

### 2. Real loopback WSS

- Run a real ephemeral TLS/WebSocket server and separately spawned Runner process.
- Drive enrollment, provisional socket, single-use connection challenge, key-possession proof,
  transcript-bound version/feature negotiation, atomic epoch supersession, `connection_ready`,
  durable delivery, ACK, typed receipt, backpressure, reconnect cursor, and unresolved-delivery
  replay. Replay proof/nonces on another socket, mutate negotiation, lose `connection_accepted`, and
  report a cursor ahead of server truth; none may skip delivery or revive an epoch.
- On a first enrollment with no admitted Enforcer key, prove `connection_ready` enters
  `DiagnosticsBootstrap`; permit only one capability challenge/submission and its ACK delivery,
  evaluate expiry by server receive time, admit the proved Enforcer key, complete the signed time
  anchor, and only then promote to `Current`. With an existing admitted key, require anchor outcome
  before `connection_ready`; unavailable enters `DiagnosticsOnly`, and only a bounded accepted retry
  promotes the same epoch. A late/invalid first submission receives only its sequence-closing ACK
  before terminal secure recovery/re-enrollment. Reject a second challenge, any other order/fact,
  any worktree/grant/process/provider effect, and every execution admission before promotion.
- Assert `serverConfirmedDeliveryAckCursor` and the effective
  `deliveryReplayAfterCursor=min(reported, confirmed)` separately for behind/equal/ahead reports;
  reject every unknown/cross-family feature literal and non-intersection selection.
- Prove inclusive last-processed cursor reporting and exclusive `+1` replay, each family sequence
  domain, and the signed time-anchor/uncertainty calculation. Delay past the uncertainty/anchor
  bound must reject Enforcer arm/renew rather than lengthen authority.
- Kill the socket after journaled delivery but before ACK; reconnect must replay the same delivery
  semantic command under a new current-connection envelope and the process action must occur once.
- Kill the socket after a capability, execution, or reconciliation fact is durably journaled locally
  but before server admission. The new `connection_accepted.authoritativeReplayCursors` must expose
  every contiguous family position; the Runner must replay the byte-identical inner `factDigest`
  inside a new current-connection outer frame, and no replay may collide or skip a gap. Assert the
  immutable semantic bytes/hash do not change while the envelope/attempt/connection does.
- For every persistent family, lose the live signed fact-admission ACK before and after server
  commit. The Runner must retain until an `admitted|duplicate_admitted` contiguous ACK, replay the
  exact fact, advance only the matching family cursor, and prune only after durable ACK persistence.
  A forged/wrong-purpose/gapped ACK cannot advance or claim evidence completeness. Hold a later fact
  as `pending_gap`, fill the missing sequence, and require a higher signed ACK revision on the same
  admission-ACK stream to move it to `admitted`; an older or changed same-revision snapshot rejects.
  Assert `serverReceivedAt` remains the first fact-ingress observation, every newer revision has a
  strictly later signed `ackIssuedAt`, and the fact-admission key is valid at issuance rather than
  at fact receive time. Across reconnect, assert the inner ACK snapshot/hash/signature stays
  byte-identical while the outer ACK-delivery ID/connection/transcript/hash/signature changes and
  verifies under the current connection-control key. Reject a connection-bound inner snapshot and a
  historical signer outside its trust interval. Attempt Runner-key rotation after server admission
  but before ACK persistence and prove cutover is rejected until the stored ACK replays and the
  signed prune-safe cursors equal server truth.
- Repeat the previous case for an autonomous-Enforcer fact and for daemon restart with a changed
  outer `bootIncarnation`; only a fact whose original boot belonged to a prior authenticated epoch
  and whose immutable sequence/digest is next may replay. Rotate/recover enrollment before its first
  ACK and prove the immutable `factEnrollmentEpoch` remains old while `ackSigningEnrollmentEpoch`
  and outer `deliveryEnrollmentEpoch` are current; reject that split for an ordinary Runner-key
  fact. Prove a late capability replay closes its sequence as stale evidence without deadlocking on
  the original connection or creating admission.
- Deliver a higher trust bundle during Current operation, disconnect before and after Runner
  persistence/ACK, and prove ordered replay, exact ACK idempotency, collision handling, and no
  command delivery under an unacknowledged required bundle.

### 3. Real Postgres/RLS

- Use the application database role and real tenant RLS for enrollment grants, key epochs,
  capability challenges/submissions/admissions, one active connection epoch, consumed challenge and
  negotiated transcript, command ID/hash plus delivery/attempt mappings, outbox atomicity, inbox
  uniqueness, heartbeat/capability/execution/reconciliation/Enforcer sequence domains and gap state,
  autonomous-Enforcer sequence domains, managed-enforcement admission/decision sequences, Human
  Input Action lifecycle, artifact-upload admissions, fact-admission ACK cursors, detector epochs,
  revocation, and cross-tenant denial.
- Race managed-enforcement quiescence/rotation/revocation, decision-use CAS, Lease Secret Broker
  last-use reservation, Slack action-nonce CAS across distinct interaction IDs, and fact ACK versus
  gap admission. Require the closed quiescence order/report, exact process membership, final
  decision/producer cursor equality, and one lifecycle cutover; missing/changed reports or reserved
  forwards cannot activate the candidate. Exactly one authority/use/outbox/cursor transition wins
  each race.
- Prove state plus outbox commit together and a crash/retry creates no second semantic order.
- Race Human Input Action consume against expiry, revocation, role loss, Ready/policy change, and
  duplicate submissions. Exactly one terminal CAS result may create exactly one new authorized
  command; no losing path mutates the original fact or persists unsafe input.

### 4. Deterministic Runner saga without a model

- Real Postgres + real WSS + a tiny deterministic fake Harness Adapter/process.
- Claim → pre-spawn registration receipt → Enforcer arm outcome → every required secret-grant
  activation receipt → start delivery → ACK → durable spawn marker → signed start receipt → inbox →
  WF-230 transition worker. Prove no process can spawn before the three preconditions and exact
  retries create no second registration, grant activation, Enforcer authority, or process.
- Repeat the saga with zero required grants and require the typed empty-set activation order/fact; a
  direct Phase-A `start_pending` transition or start delivery before that fact must fail.
- Drive credential-provisioning no-start loss, signed no-process rejection, crash after spawn before
  receipt, partial grant failure/disposal, `human_input_required`, `policy_denied`, late receipt
  after fence, Enforcer arm/renew/fence duplicate/collision/gap, preview-delivery close success and
  failure facts, containment confirmation, Blocked resolution, and fresh claim with new
  lease/fence/nonce.
- Force checkpoint failure, unavailability, and deadline expiry in delivered and autonomous
  containment. Require one `checkpoint_not_recorded` with the exact request identity and last
  trusted binding, followed by applicable grant/preview cleanup and one stop/quarantine outcome.
- Prove both legal `command_rejected_no_action` variants: registration rejection has no workspace or
  process action, while start rejection preserves the reserved workspace/process and proves only
  spawn absence. Reject every crossed phase/observation/proof combination.
- Prove Human/policy facts at `before_registration` use `none`/`none`, at `before_spawn` use the
  reserved observations, and at `managed_runtime` use the observed process; reject phase-proof or
  observation substitution.
- Exercise fresh and adopted `continuationBinding`; adoption must equal the admitted checkpoint
  lineage and last server-confirmed receipt sequence after prior containment, never a
  Runner-proposed cursor.
- Run managed-harness envelopes through challenge-bound enforcement admission, deny canaries,
  independently observed non-forwarding, per-call allow/deny decision receipts, canonical argument
  and invocation digests, one-use forward CAS/receipt, profile/policy drift, rotation/revocation,
  direct-call bypass detection, producer-sequence replay, output redaction/quarantine, per-artifact
  oversize/policy-disallowed receipts, and skill/MCP revision binding. A bypass or mismatched
  receipt contains execution; unsafe content never becomes Card evidence. Substitute target kind,
  namespace, opaque ID, revision, scope digest, and `none` for a governed target; every mismatch
  must deny before forwarding and the exact admitted target must succeed once.

### 5. Real OS repository/process fixture

- Create a temporary Git repository and actual `git worktree`; spawn a process group with a child,
  optional container/port fixture, checkpoint it, kill/restart the daemon, reconcile, and
  stop/quarantine.
- Test wrong remote/common-dir/base SHA, symlink/path traversal, branch/worktree collision, dirty
  state, orphan child, PID reuse defense, adoption only under fresh claim, and cleanup failure.
- Kill the Runner daemon while the Lease Enforcer survives, kill the Enforcer while daemon/child
  survive, kill both, corrupt journal continuity, and reboot. The independent OS containment
  primitive must stop/quarantine or leave execution unknown; no case may silently continue or
  release capacity/grants.
- Exercise #231's trusted Git transport broker with an exact signed old/new-SHA plus admitted-
  artifact-reference/digests handoff; raw bundle bytes must be fetched from artifact ingress. Prove
  stale preparation order and authenticated `exact_ref_publication_submission` handoff. Prove stale
  old SHA, wrong objects/ref/lease/fence/nonce, replay/collision, provider-health loss, and
  force-update attempts fail, and prove no GitHub installation/Contents-write credential enters
  Runner state or environment.
- Exercise the prior `prepare_object_bundle_upload` and artifact-ingress seam with the raw bundle
  unavailable to WSS: exact metadata/body replay returns one admission; changed bytes/metadata,
  Runner-claimed clean versus ingress-detected secret, oversize, failed scan, policy-disallowed
  media/object, wrong tenant/lease/worktree/ref/SHA/manifest, expired nonce, premature publication,
  deleted/expired admission, and broker digest mismatch fail without a handoff. Prove every attempt
  receives the safe signed admitted/rejected receipt and pending/unknown publication retains the
  exact admitted artifact until #231 resolves it.

### 6. Secret canary

- Use an opaque named ref and temporary local grant Adapter with a unique canary.
- From the real Codex CLI Harness and a spawned descendant, adversarially attempt environment, argv,
  inherited-FD, broker-socket, file/path, `/proc`, process-memory, and namespace reads. Every
  raw-value read must be denied while the allowlisted typed broker operation still succeeds.
- Assert the canary is absent from every WSS frame, Postgres row, outbox/inbox, Runner journal safe
  view, logs, errors, Slack/Ask Admin/MCP fixture, GitHub payload, diff/commit, checkpoint, and
  evidence summary, including harness environment and process listings.
- Race fence/revoke with use; distinguish local grant removal from upstream revoke confirmation.
- Exercise the exact Broker request/response MACs, peer/process/containment binding, one-use and
  bounded-use lifecycle, duplicate replay without a second provider action, sequence/nonce collision
  revocation, concurrent last-use requests, pre-dispatch reservation, destination/redirect denial,
  expiry, crash-before/after-reservation unknown reconciliation, capability disposal, and raw-secret
  denial.

### 7. Slack and Ask Admin HTTP contracts

- Real Slack handler with signed raw-body fixtures: bad signature/time, provider retry, wrong
  installation/team/user, unmapped/revoked Admin, stale target/version, expired/replayed nonce, role
  revocation, and exactly one bounded decision.
- Crash the Slack handler before and after its short transaction commit. Before commit it must
  return retryable failure and create no command; after commit every provider retry must return the
  stored ACK while exactly one command-intent outbox row is processed. Race distinct provider
  interaction IDs against the same action nonce; the CAS permits exactly one queued row.
- Real authenticated Ask Admin route/tool call: on-behalf-of chain, turn/tool idempotency, caller-
  supplied authority ignored, no `operator.admin`, and no approval inference.
- Real MCP link and tool call: token hash/scope/expiry/revocation/role/cross-tenant checks,
  request-ID replay and changed-digest collision before/after token rotation or revocation,
  principal/client namespace separation, over-quota no-tombstone behavior, caller-supplied authority
  rejection, safe argument validation, and exactly one public-seam command. Assert the token and
  hash never reach the model, Runner, Card, evidence, logs, or project arguments.

### 8. Canonical local-stack acceptance

- Drive one real-user, no-other-tab flow on a supported Linux fixture against the local stack: sign
  in through the browser, open Admin Runners, create a single-use enrollment, copy/run the real CLI
  bootstrap with grant over stdin, confirm the displayed fingerprint, explicitly select the pinned
  and probed **Codex CLI** Harness Adapter/tool/version in `managed_ordinary` mode, observe its
  challenge-bound Capability Admission, then assign a Todo DevTicket and invoke its real claim/start
  action. The mandatory acceptance run uses the real pinned Codex CLI Adapter wrapper, executable
  identity/version probe, process/worktree/containment seams, and a deterministic no-model fixture;
  it spends no model tokens. Observe pre-spawn registration → Enforcer arm → secret activation →
  start receipt move the Card to In Progress. A separately reported optional live-model vendor smoke
  may check compatibility, but cannot satisfy or fail this protocol acceptance gate.
- While that exact Linux Codex CLI Harness process runs, cut the Runner network. In the browser
  prove liveness expires, the work becomes Blocked/Execution Unknown as WF-230 owns, preview
  delivery is revoked, a branch/worktree/checkpoint-safe Slack summary is recorded, and no cloud
  Runner is selected. Restore the same local Runner, complete a new connection challenge, display
  the signed Reconciliation Observation, contain old authority, then use the UI to authorize a
  **fresh** claim with new lease/fence/nonce. Prove the verified worktree may be adopted but the old
  lease/process is never resumed, and the Card returns to In Progress only after the new accepted
  start receipt.
- Run the flow through Traefik's production-equivalent broker path with real browser session/RLS,
  real Postgres outbox/inbox, signed Runner frames, real Codex CLI process/worktree, and signed
  Slack HTTP fixture; screenshots alone or direct database mutation do not satisfy it.
- Interrupt network, restart broker and Runner, rotate/revoke keys, drift capability, and prove safe
  Admin freshness/status, branch-accurate Slack summary, replay, containment, and no failover.
- Use the shared local Docker capability only as #229 authorizes; prove cloud rejects local Review
  commands.

### 9. Parameterized Adapter matrix

- Run one mandatory Runner Protocol/Supervisor contract suite against Codex CLI and Claude Code
  pinned supported versions using deterministic no-model probes and fixture processes only. Optional
  live-model vendor smoke is separately labeled, bounded, non-gating, and never protocol evidence.
- Run platform-specific Codex Desktop Adapter tests only on supported hosts.
  Unsupported/experimental rows must render unavailable rather than being skipped and called
  healthy.
- Run the same identity/wire/containment suite for local-machine and cloud-service enrollment;
  assert cloud never becomes an implicit failover and never advertises local Review.
- Use a real local OIDC test issuer for cloud enrollment. Prove exact
  issuer/audience/subject/service and tenant binding, token `jti` replay/collision/expiry,
  issuer-key rotation/revocation, Runner-key possession/rotation/recovery, grant atomicity, and
  Unavailable behavior when issuer trust is absent.

## Rejected alternatives

| Alternative                                             | Why rejected                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Treat MCP link token as Runner enrollment               | Proves a user/session tool request, not machine key, process, worktree, fence, or receipt           |
| Reuse OpenClaw Node/Device pairing                      | Makes OpenClaw authority transitively grant Dev Board execution and violates the ACL/identity split |
| Runner calls generic remote shell commands              | Expands cloud compromise into arbitrary host control and makes policy/containment unverifiable      |
| Move to In Progress on command ACK or lease insert      | Neither proves the process actually started; contradicts WF-230                                     |
| Rely only on database fencing                           | Cannot stop a stale local process from editing/pushing/leaking secrets                              |
| Use arrival time as receipt order                       | Network/reconnect order is not causal; sequence/fence/inbox arbitration already own authority       |
| Reset sequence on reboot                                | Enables replay/collision ambiguity inside one lease                                                 |
| Resume old lease after reconnect                        | Reanimates stale authority and contradicts WF-230 fresh recovery                                    |
| Automatically fail local work to cloud                  | Risks two writers and was explicitly rejected by the user/foundation                                |
| Put secret values in prompts/env/frames for convenience | Leaks into model context, process listings, logs, evidence, history, and cards                      |
| Let Slack/Ask Admin free text approve                   | Ambiguous, replayable, and not bound to exact actor/action/version/nonce                            |
| Hardcode client support from marketing/flag presence    | OS/version/mode availability changes and does not prove safe process control                        |
| Claim hardware attestation from signed software reports | V1 has no hardware trust root and must not overstate assurance                                      |
| Create a second public Runner listener                  | Violates the one-ingress deployment contract and increases attack/ops surface without need          |

## Downstream implementation constraints

1. Implement Runner Registry and protocol persistence before any UI can label a machine execution-
   eligible.
2. Implement golden vectors and parser limits before accepting a real Runner connection.
3. Ship outbox/inbox/detector and the deterministic fake Harness Adapter before Codex/Claude
   Adapters.
4. Ship the independently supervised Lease Enforcer and process/worktree fixture before remote
   launch is enabled.
5. Ship Lease Secret Broker and canary scan before any secret-requiring claim.
6. Route UI, Slack, Ask Admin, MCP, Sprint controller, and agents into the same server command seam;
   none receives a private Runner transition path.
7. Keep vendor Adapters version/mode gated and independently disableable. A client update may make a
   row unavailable without weakening workflow truth.
8. Implement #229 before local Review/Done and #233 before autonomous scheduling. #232 merely makes
   their future typed orders transportable.
9. Admin Runners/Environments/Health are projections with evidence freshness; Unknown is never
   Healthy and the Overview owns no mutation.
10. #235 must name retention for raw telemetry/artifacts without expiring authoritative hashes,
    containment, approvals, or evidence relied upon.

## Canonical amendments carried by this resolution

The same reviewed change promotes only the minimum durable contract:

- it adds only the new canonical Runner terms to `CONTEXT.md`;
- it sharpens the Runner topology and `RunnerControlPort` in `ARCHITECTURE.md` and the
  one-public-ingress wording in ADR-015;
- it adds a concise invariant/pointer amendment to ADR-017, PRD-019, PRD-013, PRD-005, and the
  foundation ledger rather than copying the full wire protocol;
- it prepares this memo for explicit **current input** designation in the migration manifest only
  after reviewed landing, tracker comment/closure, and the matching parent-map pointer; that pointer
  must remain until #237 consumes it;
- it adds the official vendor/RFC sources to `docs/plan/official-docs.md` for implementation
  revalidation;
- it synchronizes only stale status markers for already-landed/closed WF-236 so the active map and
  registries no longer contradict its recorded lifecycle; this bookkeeping neither reopens nor
  amends the Release contract and creates no #236 implementation authority;
- it preserves frozen EXECUTION/grilling/consensus records and quarantined issue bodies.

## Prepared resolution

This candidate resolves Wayfinder #232 with an outbound, separately authenticated Runner role on
Opzava's single public broker WSS ingress; secure key-possession enrollment; versioned software
compatibility evidence; durable typed command delivery; domain-separated signed ordered receipts;
independently supervised Lease Enforcer, worktree/process/grant containment; fresh-claim-only
recovery; and provenance-only Slack, Ask Admin, MCP, and OpenClaw adapters. Execution Admission
remains the sole owner of DevTicket authority.

The protocol is deliberately transport- and harness-agnostic but not vague: Codex Desktop, Codex
CLI, Claude Code, local machines, and cloud services satisfy one exact conformance contract through
separate Adapters. No automatic failover, generic remote shell, self-asserted authority, secret
propagation, or old-lease resurrection is permitted.
