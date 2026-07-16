# WF-232 — enrolled Runner and coordination trust protocol

Status: **Resolved planning input for Wayfinder #232; product code is not implemented.**

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
7. V1 frames use domain-separated RFC 8785 canonical JSON and Ed25519 signatures. They bind
   protocol, enrollment/key epoch, connection epoch, delivery/command identity, lease/fence/nonce,
   durable receipt sequence, exact contract/repository/worktree/process identity, and policy
   digests. Duplicate bytes are idempotent; a sequence collision, gap, stale epoch, stale fence,
   downgrade, or revoked key fails closed.
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
14. The implementation must pass deterministic signed-vector, real WSS, real Postgres/RLS, real
    process/worktree, secret-canary, Slack HTTP, reconnect, and local/cloud conformance tests
    without invoking a model or spending tokens.

## Evidence and authority register

Every statement in this memo has one evidence class. The class prevents a current client feature
from silently becoming Opzava authority.

The supporting [vendor-evidence appendix](wf232-runner-vendor-evidence.md) preserves the broader
first-party research trace and explicit evidence gaps. It is evidence, not a second contract; this
resolved memo and the accepted canonical amendments win if an inference in that appendix differs.

| Class                              | Meaning                                                                              | Sources used here                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Locked Opzava target**           | Accepted product/architecture decision that this ticket consumes rather than reopens | PRD-019; ADR-017; DBF-001–207; WF-230; migration manifest; parent map #228                                    |
| **Current repository fact**        | Behavior present on `development` at `bbe61690ee6acb15195fbda8bd9f1df7e7c26478`      | Exact paths in the as-built inventory below                                                                   |
| **Current vendor fact**            | First-party documented or locally probed behavior as of 2026-07-17                   | Official links and installed-client probes below                                                              |
| **Conditional Adapter capability** | Behavior Opzava may use only after a supported Adapter/version/mode probe proves it  | Tool capability matrix and effective-policy rules below                                                       |
| **Deferred unknown**               | Not sufficiently stable or evidenced for v1 authority                                | Hardware integrity attestation; generic desktop UI automation; multi-repository execution; automatic failover |

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
  [permissions](https://docs.anthropic.com/en/docs/claude-code/iam), and
  [security guidance](https://docs.anthropic.com/en/docs/claude-code/security).
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
            └─ signed Runner Capability Manifest
            └─ typed Runner Command Delivery
                 └─ Harness Supervisor
                      ├─ Codex Desktop Adapter (conditional modes/platforms)
                      ├─ Codex CLI Adapter
                      └─ Claude Code Adapter
                           └─ process registration + per-ticket worktree generation

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
negotiated protocol/features, connected/closed times, last accepted transport cursor, liveness, and
supersession reason. Exactly one epoch can be current for an enrollment.

### Secure enrollment ceremony

1. An authenticated Admin opens Runners and requests local enrollment in the secure Opzava UI.
   Server authorization creates a short-lived, single-use **Enrollment Grant** bound to Admin,
   tenant, expected Runner type, allowed setup action, setup key, nonce, expiry, and audit row.
2. The bootstrap is delivered through stdin, OS credential exchange, or another mechanism that keeps
   the grant out of process arguments, shell history, Slack, Ask Admin, and model context.
3. The Runner daemon generates an Ed25519 key locally, stores the private key in a platform-approved
   keystore, and sends the public key plus a signature over the server challenge, setup key,
   protocol range, Runner build, and a fresh client nonce.
4. The server atomically consumes the grant, verifies current Admin/session/membership and
   challenge, assigns Runner/enrollment/key epoch 1, and displays the public-key fingerprint and
   safe machine label in the same UI. Duplicate exact completion returns the original enrollment; a
   changed key or payload under the used grant is a conflict.
5. The Admin confirms the fingerprint/label before Active. Expiry, cancellation, role/session loss,
   tenant suspension, reused nonce, wrong origin, unsupported protocol, or unapproved daemon build
   leaves no Active enrollment.
6. A cloud Runner is admitted through a separate platform-admin flow and workload/service identity.
   It still receives a Runner ID, key/enrollment epoch, explicit capability policy, and no local
   Review capability.

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
- Key rotation proves both the current key and a server challenge when the current key is healthy.
  Recovery without it is secure-UI re-enrollment. Old and new keys never share an active signing
  epoch. Frames admitted before the atomic cutover retain their recorded disposition; frames
  received after it fail even if their Runner `observedAt` predates revocation.
- One connection epoch wins by server transaction. A later authenticated connection supersedes the
  earlier epoch; the old socket may remain physically open but cannot submit authoritative frames.

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
  → connection_ready admitted
  → Current (delivery enabled)
```

1. The Runner opens the dedicated WSS role/path and sends an unsigned bounded `runner_hello`
   containing only Runner ID, enrollment/key epoch and key ID, boot incarnation, a fresh 256-bit
   client nonce, supported protocol/features, and reconnect cursors. These are lookup/correlation
   claims only.
2. The server loads the current Active enrollment and sends a single-use `connection_challenge`
   containing challenge ID, fresh 256-bit server nonce, client-nonce echo, expected enrollment/key
   epoch, allowed protocol/features, server outbox high-water mark, issued/expiry times, and the
   hash of the received hello. A challenge is scoped to one provisional socket and is persisted as
   unused/expired/consumed.
3. The Runner returns a signed `connection_proof` over the domain-separated canonical transcript:
   hello, challenge, both nonces, boot incarnation, offered protocol/features, and its last
   journaled delivery and receipt cursors. Reuse on another socket, changed transcript bytes,
   expired/consumed challenge, or a stale/revoked enrollment/key fails before an epoch exists.
4. The server chooses the highest mutually allowed protocol and exact feature set; the client cannot
   force a downgrade. One transaction consumes the challenge, records the negotiated transcript hash
   and authoritative reconnect cursors, increments the enrollment's connection epoch, marks that
   epoch Current, and supersedes every earlier epoch. From that commit, old-socket frames fail even
   if the old TCP connection remains open.
5. The server sends a signed `connection_accepted` binding the new epoch, transcript hash,
   negotiated protocol/features, authoritative replay start cursor, server time, and trust-bundle
   version. The Runner verifies it and replies with signed `connection_ready` under that exact
   epoch/transcript. No command delivery or Runner fact is accepted before `connection_ready`.

The proof and negotiated transcript use the canonical encoding defined below:

```text
connectionProofSignature = Ed25519.sign(
  enrolledRunnerKey,
  UTF8("opzava.runner.connection-proof.v1\0") ||
    RFC8785({ runnerHello, connectionChallenge, reportedReconnectCursors })
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
```

The pinned Server Command Trust Bundle authorizes `serverConnectionKey` for connection acceptance
only. Both nonce values and the challenge ID are inside the proof/transcript; changing selection
after proof changes the transcript hash. The server persists their hashes and consumption state so
socket reconnect, broker retry, and database failover cannot reuse them.

Reconnect never trusts a client cursor to skip server work. If the Runner's last journaled delivery
cursor is behind the server's last confirmed ACK cursor, the server replays from the lower cursor;
semantic dedupe makes that safe. If the Runner reports ahead, the server replays from its own
confirmed cursor and records a reconciliation discrepancy rather than advancing. Receipt replay uses
the server's last admitted per-lease sequence and the Runner's signed journal observation; a gap
remains `pending_gap`. Losing `connection_accepted` simply causes a new challenge and a newer
epoch—an unready epoch never receives work and an old epoch is never revived.

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
makes a Runner execution-eligible:

1. On a Current connection, Runner Registry issues a signed `capability_manifest_challenge` order
   with challenge ID/nonce, expected enrollment/key/connection/boot, required probe schema and
   policy version, prior manifest hash/sequence, and expiry.
2. The Runner performs only the allowlisted probes and sends a signed
   `capability_manifest_submission` frame with the exact challenge/nonce, monotonically increasing
   `capabilitySequence`, manifest object/hash, probe-result digests, observed/expiry times, and no
   arbitrary command output. Submission does not self-approve a capability.
3. Runner Registry verifies challenge single use, signature, sequence, schema, freshness, daemon and
   Adapter build identities, and executable/tool/version/mode probes. It persists the immutable
   observation, then policy evaluation writes a separate **Capability Admission** with effective
   capability digest, assurance class, allowed Harness Adapter/tool/version/modes, hard safe
   implementation maximum, local/cloud eligibility, policy version, and expiry.
4. A signed `capability_manifest_admitted` or `capability_manifest_rejected` server result binds the
   submission and admission/reason code. Execution Admission may use only the current persisted
   Capability Admission; a Runner cannot claim eligibility from the result frame itself.

The same `(runnerId, enrollmentEpoch, capabilitySequence, manifestHash)` is idempotent. A reused
sequence/challenge with another hash, a sequence gap, stale connection, or unsupported critical
probe is rejected and suspends new admission. A lower sequence is stale evidence. Active work whose
required admission expires or is invalidated enters the owning loss/containment path; it is never
reported stopped merely because capability changed.

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
- field names and enum values are exact case-sensitive ASCII; unknown critical fields fail;
- optional fields are omitted when absent—`null` never means absent—and arrays that are part of a
  frame schema are present even when empty;
- SHA-256 values are lowercase `sha256:<64 hex digits>` strings; Ed25519 public keys, signatures,
  and 256-bit nonces are RFC 4648 §5 base64url **without** `=` padding;
- UUID identifiers use lowercase canonical hyphenated text; 64-bit epochs, sequences, and cursors
  use canonical unsigned decimal strings with no leading zero except `"0"`;
- instants use UTC RFC 3339 with exactly millisecond precision (`YYYY-MM-DDTHH:mm:ss.SSSZ`), and
  durations/deadlines use integer milliseconds or the explicitly named monotonic counter—not a
  locale string or floating-point number;
- a Runner Delivery Envelope embeds the Semantic Runner Order as the `semanticOrder` JSON object,
  not JSON-in-a-string, base64 bytes, or an artifact reference. The receiver canonicalizes that
  object, verifies its semantic signature/hash, and equality-checks the envelope's
  `semanticCommandHash` before journaling or ACK.

Any alternate padding, uppercase/missing digest prefix, explicit-null optional, unsafe numeric
encoding, timestamp precision, or embedded-order representation is noncanonical and rejected rather
than normalized before signature verification.

Runner-to-server frames, and any v1 frame type without the specialized server construction below,
sign:

```text
UTF8("opzava.runner.frame.v1\0") || RFC8785(frame_without_signature)
```

with Ed25519. The frame carries `keyId` but the server chooses the allowed algorithm from the key
authorization/protocol version; a caller cannot downgrade it. The signature is base64url. Every
digest below names its own domain-separated preimage. No digest preimage contains that digest field
or any signature field.

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

- duplicate JSON keys, non-I-JSON numbers, invalid Unicode, noncanonical encodings, unknown critical
  fields, unsupported major versions, forbidden compression, and oversized frames;
- wrong domain, direction, role, key, enrollment epoch, connection epoch, tenant/workspace equality,
  protocol feature, signature, hash, nonce, lease/fence, capability/policy digest, or repository
  binding;
- frames received after key/enrollment/connection revocation or expiry.

### Server-to-Runner Command Delivery

A **Semantic Runner Order** is persisted before network send. Its signed canonical bytes and
`semanticCommandHash` never change across retry or reconnect and contain:

| Field                                                  | Contract                                                                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `protocolVersion`, `messageKind=runner.semantic_order` | supported semantic contract and fixed direction                                                                                                                                                                    |
| `commandId`, `semanticCommandHash`                     | immutable semantic identity; signed canonical command bytes are identical on every retry                                                                                                                           |
| `runnerId`, `enrollmentEpoch`                          | exact admitted target; no connection-specific field is part of the semantic command                                                                                                                                |
| `serverCommandKeyId`, `issuedAt`, `expiresAt`          | server authenticity and bounded validity under the pinned command-key trust bundle                                                                                                                                 |
| `commandKind`                                          | one typed order from the allowlist; never a shell string                                                                                                                                                           |
| `authorityBinding.kind`                                | discriminates `runner_registry` from `execution`; fields from another variant are absent                                                                                                                           |
| Runner Registry binding                                | capability challenge ID/nonce, required probe/policy version, prior manifest hash/sequence, expiry                                                                                                                 |
| Execution binding                                      | lease/fence/claim/DevTicket, Ready Contract/hash, execution binding ref, and one-use command nonce/purpose                                                                                                         |
| Execution workspace binding                            | repository/worktree generation/branch/expected HEAD and process registration when the order phase requires it                                                                                                      |
| Execution capability binding                           | `capabilityAdmissionId`, `capabilityManifestHash`, Adapter-policy/authorization versions, `harnessAdapterKind`, `harnessAdapterVersion`, `toolKind`, `toolObservedVersion`, `controlMode`, and optional `modelRef` |
| Execution grant binding                                | opaque already-authorized secret/preview handles only; arrays are present even when empty                                                                                                                          |
| `payload`                                              | bounded typed safe fields and artifact refs; no prompt/command/free-text/log/secret blob                                                                                                                           |

Each network attempt wraps that immutable order in a separately signed **Runner Delivery Envelope**
containing `deliveryAttemptId`, `deliveryId`, `semanticCommandHash`, Runner/enrollment, the current
`connectionEpoch`, negotiated transport protocol/features, outbox cursor, sent time, and envelope
key ID/signature. Reconnect creates a new envelope/attempt for the current connection but carries
the identical semantic bytes/hash. The Runner verifies both signatures and equality bindings before
journaling the semantic command. Its ACK identifies the attempt/envelope hash and semantic command
hash; it cannot mutate or acknowledge a different command. Duplicate semantic commands return the
original action disposition even when their delivery envelopes differ.

Permitted order families are `capability_manifest_challenge`, `prepare_execution_registration`,
`activate_secret_grants`, `arm_lease_enforcer`, `renew_lease_enforcer`, `fence_lease_enforcer`,
`start_execution`, `checkpoint_execution`, `checkpoint_and_stop_or_quarantine`,
`revoke_local_grant`, `close_preview_delivery`, `prepare_exact_ref_publication`, and
`request_reconciliation_observation`. Review-specific orders are added only by #229 behind its
authority.

### Server command-key trust

Runner enrollment returns a versioned **Server Command Trust Bundle** over the authenticated setup
channel. The bundle pins an Opzava Runner command root and separately purpose-authorized
connection-acceptance, semantic-order, and delivery-envelope public keys with key ID, algorithm,
activation/retirement interval, and trust-bundle version. The Runner stores only public material and
refuses a command key not authorized for that purpose.

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

### Runner-to-server frames

Every authenticated Runner frame binds:

- protocol/direction/message kind and message ID;
- Runner/enrollment/key/connection/boot incarnation;
- delivery/command/lease/fence/nonce as applicable;
- durable `receiptSequence` scoped to the lease and never reset by daemon reboot;
- exact DevTicket/contract/repository/worktree/branch/HEAD/process registration and capability
  policy versions as applicable;
- Runner `observedAt`, monotonic offset/duration where useful, safe structured reason code, bounded
  payload digest/artifact refs, and signature.

Typed frames are:

| Frame                                                                       | Meaning                                                                                                  | Not sufficient for                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `transport_ack`                                                             | Exact delivery-envelope attempt was journaled and its semantic-command equality was verified or rejected | process start, checkpoint, lane change                                   |
| `command_rejected_no_action`                                                | Command could not be accepted and no local action/registration/process began                             | resource release without matching WF-230 containment/grant confirmations |
| `capability_manifest_submission`                                            | Challenge-bound signed capability observation with monotonic capability sequence                         | capability admission or claim/start eligibility                          |
| `process_registration_reserved`                                             | Pre-spawn launch reservation, Adapter plan, containment handle, and durable no-process marker            | process start or secret-grant activation                                 |
| `secret_grants_activated`                                                   | Every required opaque grant handle is locally active for the exact pre-spawn registration                | process spawn or proof the value was never exposed                       |
| `secret_grant_activation_failed`                                            | Named safe reason and per-handle disposition; spawn remains forbidden                                    | containment release without no-process/grant-disposal proof              |
| `lease_enforcer_armed` / `lease_enforcer_renewed` / `lease_enforcer_fenced` | Exact authority order hash/nonce/sequence and independent-Enforcer outcome                               | workflow renewal, process termination, or grant disposal by itself       |
| `execution_started`                                                         | Durable spawn marker exists and exact supervised process is alive/working in bound worktree              | bypassing `RecordExecutionStartedReceipt`/`AcceptExecutionStarted`       |
| `checkpoint_recorded`                                                       | Exact process/worktree observation and artifact digest were durably captured                             | proof process stopped or clean Review evidence                           |
| `containment_confirmed`                                                     | Exact process tree/worktree is stopped or quarantined for the named Runner Containment Request           | external credential/tunnel revocation or DevTicket transition            |
| `local_grant_disposed`                                                      | Exact local lease grant is removed/unusable                                                              | underlying provider credential revoked upstream                          |
| `human_input_required`                                                      | Bounded safe input schema/action ref and originating command phase require governed Human action         | approval, policy change, process stop, or automatic retry                |
| `policy_denied`                                                             | Current Adapter/tenant policy rejected the exact typed operation with a stable safe reason code          | Human rejection, permanent failure, or permission to weaken policy       |
| `exact_ref_publication_submission`                                          | Authenticated #231 handoff for exact ref/old/new SHA and object-manifest digest                          | provider acceptance, ref update, PR/check/merge fact, or force push      |
| `reconciliation_observation`                                                | Current process/worktree/grant/journal facts after reconnect/reboot                                      | automatic resume or old-lease resurrection                               |
| `runner_heartbeat`                                                          | Connection/daemon liveness and current journal cursors                                                   | process truth, lease grant, start, or checkpoint                         |

`human_input_required` and `policy_denied` are governed outcomes, not unstructured tool stderr. Both
bind the originating command/delivery, lease/fence/contract, process registration/launch phase,
Harness Adapter/tool/version/mode, stable reason code, policy version, and whether durable spawn is
proved absent, present, or unknown. `human_input_required` may add only a bounded safe input schema,
choice IDs, expiry, and secure Opzava action reference; it never embeds a raw vendor prompt or asks
for credentials in Slack. `policy_denied` names the denied capability/policy rule without exposing
secret values.

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
- Exact same sequence and canonical digest is an idempotent duplicate. Same sequence with another
  digest/key is a collision: stop accepting authority from the connection and contain the lease.
- A sequence gap or out-of-order frame is durably held as `pending_gap`, never applied to workflow,
  and prompts bounded replay from the missing cursor. If replay cannot close the gap, execution is
  unknown and the detector invokes WF-230 loss containment. Later sequence does not overwrite an
  earlier checkpoint.
- `serverReceivedAt` is authoritative for key/epoch/expiry admission. Runner `observedAt`
  participates only in WF-230's bounded start-deadline arbitration after signature, sequence,
  monotonic identity, and configured skew checks. Socket arrival order is never event order.
- Heartbeat cadence, expiry, grace, and reconnect backoff are versioned server policy. A heartbeat
  cannot renew a fenced/revoked lease or authorize beyond the server-issued expiry. Only the server
  persists a renewal after current policy and exact heartbeat/connection checks.

## Exact WF-230 mapping

| WF-230 state/command                                                | #232 fact or delivery                                                           | Required result                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ClaimRequested` / retry                                            | current Runner Enrollment and Capability Manifest refs                          | Execution Admission reauthorizes them; Runner worker gains no claimant authority                 |
| `PrepareClaim` / `ClaimAttempt(credential_provisioning)`            | pre-spawn registration → Enforcer arm → typed secret-grant activation receipts  | no start deadline/process; values never enter Opzava; each step is independently durable         |
| registration + Enforcer arm + all grants accepted → `start_pending` | one durable `start_execution` binding their receipt digests and exact nonce     | ACK is not start; duplicate delivery never duplicates spawn                                      |
| `RecordExecutionStartedReceipt`                                     | verified `execution_started` frame                                              | minimal safe envelope enters Runner inbox before lane worker                                     |
| `AcceptExecutionStarted`                                            | consumes verified inbox fact                                                    | only Execution Admission moves Todo/Starting to In Progress                                      |
| signed no-process rejection                                         | `command_rejected_no_action` with exact start nonce and durable no-spawn proof  | `RejectExecutionStart` selects Start Rejection Containment or existing interruption owner        |
| provisioning loss before start exists                               | activation/revocation facts plus deterministic no-start/no-process evidence     | `DetectExecutionLoss`/provider command selects Pre-Start Admission Loss or existing interruption |
| start deadline                                                      | receipt inbox cursor and verified observed/receive times                        | `RecordExecutionStartDeadlineElapsed` records time only; WF-230 verifier decides winner/loss     |
| `BlockExecution` or loss after start may exist                      | delivery for exact `RunnerContainmentRequest`                                   | Runner checkpoints and stops/quarantines exact registration/worktree                             |
| `ReconcileRunnerContainment`                                        | `containment_confirmed` plus grant/tunnel disposition refs                      | WF-230 alone releases when every proof is present                                                |
| `DetectExecutionLoss`                                               | one detector epoch from disconnect/lease/key/capability/Lease Enforcer evidence | exact credential-provisioning versus start-pending/started branches remain unchanged             |
| Runner reconnect                                                    | signed `reconciliation_observation`                                             | no lane change, resume, or old lease resurrection                                                |
| `ResolveOrSupersedeBlock`                                           | safe containment/reconciliation proof                                           | returns only to Todo/Backlog per WF-230, never directly In Progress                              |
| continuation                                                        | new explicit `ClaimAndStart` after durable containment                          | new Claim Attempt, lease, fence, nonce; may adopt verified worktree/checkpoint                   |

Runner Protocol may record authenticated evidence that loses a race, but it labels it stale/rejected
and preserves it in the Runner ledger. It cannot reverse a winning fence/containment transaction.

## Local Lease Enforcer, partition, and crash contract

Database fencing prevents future receipts from being authoritative; it does not stop a process that
still has filesystem/network access. Every execution-capable Runner therefore has a minimal **Lease
Enforcer** outside both the vendor harness and the main Runner daemon. It is independently
supervised by the OS and owns the kill-capable cgroup/job/scope or equivalent containment handle. A
platform is execution-eligible only when its Adapter probe proves this fail-closed boundary; a
daemon timer or in-process heartbeat alone is insufficient.

The Lease Enforcer verifies the server-signed control lease/fence generation against the pinned
command trust bundle and translates its deadline into a local monotonic deadline. The Runner daemon
cannot extend it with an unsigned local message. Daemon loss arms containment immediately; only a
fresh healthy daemon handshake under the same still-current server authority may complete within a
bounded restart grace that never exceeds the signed lease deadline. If connection/renewal is lost
beyond grace, key/enrollment or command trust is revoked, capability becomes invalid, the server
issues a higher fence, or the daemon cannot re-establish supervision, the Lease Enforcer must:

1. reject new tool/start/grant/tunnel operations under the old authority;
2. durably mark containment intent and the last known receipt cursor;
3. request a bounded checkpoint from the Harness Supervisor;
4. remove local lease grants and close local preview delivery;
5. stop the registered process group and known descendants, or quarantine the process plus worktree,
   containers, ports, and grants when stop cannot be proven;
6. journal signed safe outcomes for replay after reconnect.

Execution Admission is the only authority that creates Enforcer authority; Runner Protocol merely
delivers it. Each admitted Lease Enforcer has a purpose-scoped Ed25519 outcome key registered by the
challenge-bound capability ceremony. This is software key-possession evidence, not hardware
attestation. The Enforcer itself—not the daemon or Harness Adapter—verifies these signed Semantic
Runner Orders and durably signs the corresponding outcome:

| Order                  | Required authority fields                                                                                                                                                                                          | Exact accepted outcome                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `arm_lease_enforcer`   | lease/fence/claim, `enforcerAuthoritySequence="1"`, fresh 256-bit `enforcerAuthorityNonce`, containment registration/handle digest, server lease expiry, maximum monotonic duration, policy/command-trust versions | persist authority/order hash before grants or spawn, establish the monotonic deadline, return `lease_enforcer_armed`                             |
| `renew_lease_enforcer` | same lease/fence, next contiguous authority sequence, fresh nonce, previous accepted authority-order hash, new server expiry/duration bounded by the current server lease                                          | atomically persist the new order/deadline and return `lease_enforcer_renewed`; daemon heartbeat alone cannot renew                               |
| `fence_lease_enforcer` | named lease, strictly newer fencing token or current-token terminal fence, next contiguous authority sequence, fresh nonce, previous accepted order hash, containment-request ID/reason                            | atomically make the authority non-renewable, begin containment, and return `lease_enforcer_fenced`; later stop/quarantine proof remains separate |

The Runner-to-server Enforcer frame carries the signed Enforcer outcome object and is also signed by
the current authorized Runner enrollment key with the current `connectionEpoch` and negotiated
transcript hash in its signed body. The server verifies that enrollment-key frame binding and the
registered Enforcer outcome key; daemon relaying cannot edit or invent the independent outcome.

The Enforcer journal has uniqueness on
`(runnerId, enrollmentEpoch, leaseId, enforcerAuthoritySequence)` and on each authority nonce. The
same sequence/nonce/canonical order hash returns the original signed outcome. The same sequence or
nonce with another hash is tamper and immediately fences/contains. A lower sequence, older fence, or
expired order is a signed stale rejection and cannot alter the deadline; a sequence gap or
mismatched previous-order hash enters containment because the Enforcer cannot assume the missing
authority was only a renewal. An arm against an already armed different containment handle is a
collision. No rejected/duplicate order moves a Card, releases capacity, or proves a process stopped;
Execution Admission consumes verified outcomes and retains every workflow decision.

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
| Daemon dies while Lease Enforcer lives                     | Enforcer applies restart grace bounded by signed deadline, then stops/quarantines unless a healthy same-authority handshake completes            |
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
vendor harness. To publish, the Runner submits a signed bundle containing repository, exact ref,
expected old SHA, proposed new SHA, lease/fence/contract/worktree identity, commit/object manifest,
and command nonce to #231's trusted Git transport broker. That broker reauthorizes current provider
health/permissions and expected ref state, transfers/verifies the exact objects, performs the
conditional ref update with server-held credentials, and records native GitHub facts. A rejection or
old-SHA conflict is a provider/synchronization fact, never permission for Runner-side force push.

The #231 handoff is explicit and typed. Execution Admission first emits
`prepare_exact_ref_publication`, binding a one-use publication ID/nonce, tenant/repository, allowed
branch ref, expected old SHA, lease/fence/Ready Contract/worktree/process registration, current
authorization/policy, and expiry. The Runner responds on the current authenticated WSS connection
with signed `exact_ref_publication_submission`, adding proposed new commit/tree SHA, canonical
object manifest and bundle digest/artifact reference, and the exact preparation command/hash. Runner
Protocol verifies enrollment/connection/signature/sequence and equality bindings, then atomically
writes an authenticated handoff row/outbox message addressed to #231's Git transport broker. It does
not call GitHub or reinterpret the bundle.

The same `(publicationId, publicationNonce, submissionDigest)` returns the original handoff result;
another digest is a collision. Stale lease/fence, wrong ref/SHA/object graph, expired nonce, revoked
Runner, unhealthy GitHub integration, or authorization drift rejects the handoff. The #231 broker
reauthorizes current provider permission and old-ref state, imports/verifies the exact objects, and
conditionally updates the ref using server-held credentials. Its accepted/rejected provider result
is a GitHub/synchronization fact; the Runner submission is never proof of publication, PR, checks,
merge, or permission to force-update.

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
   `process_registration_reserved` with process registration ID/version, launch-attempt ID, Adapter
   plan digest, worktree/HEAD, intended process-group/job/cgroup/container handle digest, reserved
   ports, and a durable `no_process_started=true` marker.
3. The server accepts that receipt through the normal inbox, binds the Lease Credential Access
   Grants to the now-existing registration, and sends `arm_lease_enforcer`. Only an accepted
   `lease_enforcer_armed` outcome permits grant activation.
4. The server sends `activate_secret_grants` for the exact registration and opaque handles. The
   local/cloud grant Adapter returns one signed `secret_grants_activated` receipt covering every
   required handle, injection destination, expiry and disposition cursor, or a signed
   `secret_grant_activation_failed` receipt with stable safe reason/per-handle disposition. Partial
   activation is failure and triggers disposal; neither outcome contains a value.
5. Spawn remains structurally impossible until Execution Admission has accepted registration,
   Enforcer-arm, and all-required-grants-active receipts, then emits one `start_execution` order
   binding those receipt digests and the same process registration/launch attempt. Duplicate start
   delivery returns the journaled original disposition.

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
- Project secrets for agent harnesses are delivered only through an inherited file descriptor, local
  authenticated secret socket, or protected temporary file whose contents/path are excluded from
  model context and worktree access. Secret values are forbidden in harness environment variables as
  well as argv, prompts, committed configuration, visible path names, and result payloads. A future
  non-agent consumer needs a separately approved exposure contract before any environment injection
  is allowed.
- The Harness Supervisor scrubs child output and scans bounded outputs, patch/diff, commits,
  checkpoints, evidence candidates, errors, and outbound frames for a canary/fingerprint policy.
  Suspected exposure invokes the existing Absolute Stop; it is not “fixed” by redacting only the UI.
- Local cache/file/socket/descriptor cleanup and upstream provider credential revocation are
  distinct facts. `local_grant_disposed` never claims the underlying secret was rotated/revoked. A
  secret-exposure stop may require both; an ordinary fence normally removes only the derived lease
  grant.
- Cleanup failure retains containment, capacity, and worktree under the owning WF-230 lifecycle.
  Reboot or disconnect cannot infer cleanup.
- Slack, Ask Admin, MCP, Card, GitHub, Docs, activity, worklog, Runner ledger, synchronization
  ledger, evidence, preview URL, and notification payloads contain only safe names/opaque refs,
  health, version, and reason codes.

Named secret policy includes `local_only` or `cloud_eligible`. A cloud Runner cannot claim work
whose required grant is local-only. Changing this classification is a secure-UI, versioned
contract/policy change, not a Slack approval.

## Slack Personal Assistant, Ask Admin, MCP, and OpenClaw

### Slack

An actionable Slack control is an opaque one-time token resolving server-side to one existing Opzava
approval/request row. The Adapter:

1. verifies the Slack request signature over the raw body, timestamp freshness, installation/team,
   workspace, and app identity;
2. maps the Slack user to the current enrolled Admin under the tenant and rechecks role/session or
   configured Slack identity binding;
3. acknowledges within Slack's required window and enqueues processing; it never performs a long
   workflow transaction before ACK;
4. deduplicates provider retry/delivery identity and the Opzava action nonce;
5. reloads exact target/version/hash/action/expiry/authorization and submits the same server command
   as the UI;
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
- A cloud Runner always reports `local_review_transport=false`. It may implement an exact commit and
  submit the signed old/new-SHA ref-update bundle to #231's trusted Git transport broker; it never
  receives repository write credentials or pushes directly. The separately enrolled local Reviewer
  then verifies the resulting exact SHA. Cloud cannot satisfy or bypass Review.

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

| Scenario                                                      | Required outcome                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Enrollment grant replay with same proof                       | idempotent original result; no second Runner/key                                                 |
| Enrollment grant reused with different key/payload            | conflict/audit; no Active enrollment                                                             |
| Connection proof replayed on another socket/challenge         | reject before epoch; audit replay; no old/current epoch mutation                                 |
| Negotiation transcript changes or client forces downgrade     | reject connection; no `connection_ready` or delivery                                             |
| Key revoked while receipt is in flight                        | server receive/cutover order decides; after-cutover frame rejected and affected lease contained  |
| Connection epoch superseded while old socket remains          | old frames rejected even with valid key; no duplicate process action                             |
| Runner reconnect cursor is ahead of server-confirmed cursor   | replay from server cursor; discrepancy/reconciliation; never skip delivery                       |
| Capability challenge/sequence replay or collision             | exact duplicate idempotent; changed hash/gap rejects and suspends new admission                  |
| Capability manifest downgraded/expired after claim            | block new operations; invoke owning loss/containment path without pretending process stopped     |
| Command delivered twice or ACK lost                           | Runner journal returns exact original disposition; one local action                              |
| Same command ID arrives with another hash/delivery ID         | protocol incident; connection suspended, active work contained                                   |
| Delivery ID remaps to another command/hash                    | protocol incident; connection suspended; command dedupe cannot be bypassed                       |
| Receipt duplicate                                             | same digest returns original inbox disposition                                                   |
| Receipt sequence collision                                    | suspend authority and contain; never choose one payload silently                                 |
| Receipt gap/out-of-order                                      | hold pending/replay; no workflow application; timeout becomes execution unknown                  |
| Start command received but daemon crashes before marker       | no-action only if exact reconciliation proves no registration/process; otherwise unknown         |
| Process spawns before start receipt, then disconnects         | Blocked / Execution Unknown; never return Todo as rejected start                                 |
| Valid start receipt races timeout/fence                       | exact WF-230 ingress/cutoff/fence arbitration; loser remains evidence only                       |
| Signed start rejection races actual start                     | no-process proof must match journal; accepted start/process makes rejection stale                |
| Process registration receipt is lost before grant activation  | replay exact registration; no second launch attempt/worktree/containment handle                  |
| Secret grant partially activates or activation fails          | signed failure + disposal; spawn forbidden; owning pre-start path retains work/grants            |
| Enforcer arm/renew sequence collides or has a gap             | exact duplicate replays; collision/gap fences and contains; daemon cannot extend deadline        |
| Heartbeat arrives on fenced lease                             | liveness may be stored; no renewal or authority                                                  |
| Watchdog cannot kill a descendant/container                   | quarantine/unknown retained; no capacity/worktree/grant reuse                                    |
| Reconnect reports clean worktree but server knows newer fence | old process/worktree remains containment evidence; fresh claim required                          |
| Reconnect reports dirty/diverged/foreign remote               | quarantine, safe summary, Human attention; no adoption/resume                                    |
| Local Runner disconnects during Sprint                        | pause/Blocked per #230/#233, Slack summary, no cloud failover                                    |
| Cloud Runner claims local-only secret or Review capability    | admission/command rejected; no value or Review fact                                              |
| Local grant removed but upstream revoke pending               | record local disposition only; owning lifecycle retains required confirmation                    |
| Secret canary appears in output/diff/frame                    | reject/quarantine before durable unsafe persistence and open Absolute Stop                       |
| Adapter requires interactive input or current policy denies   | typed governed outcome; Blocked/contain as phase requires; new Human command/policy version only |
| Exact-ref submission uses stale old SHA or altered objects    | #231 handoff/provider rejection; no force push and no publication fact                           |
| Slack provider retries interaction                            | quick ACK and exactly one Opzava command/decision                                                |
| Slack free text says “approve”                                | discussion/intent only; no approval row consumption                                              |
| Ask Admin model supplies another tenant/user/Runner ID        | ignored as authority; current server principal/policy decides                                    |
| MCP caller claims it is the Runner                            | request may be denied/accepted as actor intent; no Runner fact without enrollment signature      |
| OpenClaw Device/Node is healthy                               | no implication that Runner enrollment/tool/worktree is healthy                                   |

## Deterministic future conformance plan

This research ticket specifies tests; it does not claim an unbuilt protocol passes them.

### 1. Golden-vector protocol suite

- Publish canonical frame bytes, SHA-256 digest, Ed25519 public key/signature, and expected parse
  result for every frame type.
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
- Publish server command trust-bundle and rotation vectors. Prove purpose separation, overlap,
  emergency revoke, highest-version persistence, root/key rollback rejection, changed-key/same-ID
  rejection, and secure re-enrollment recovery.

### 2. Real loopback WSS

- Run a real ephemeral TLS/WebSocket server and separately spawned Runner process.
- Drive enrollment, provisional socket, single-use connection challenge, key-possession proof,
  transcript-bound version/feature negotiation, atomic epoch supersession, `connection_ready`,
  durable delivery, ACK, typed receipt, backpressure, reconnect cursor, and unresolved-delivery
  replay. Replay proof/nonces on another socket, mutate negotiation, lose `connection_accepted`, and
  report a cursor ahead of server truth; none may skip delivery or revive an epoch.
- Kill the socket after journaled delivery but before ACK; reconnect must replay the same delivery
  semantic command under a new current-connection envelope and the process action must occur once.
  Assert the immutable semantic bytes/hash do not change while the envelope/attempt/connection does.

### 3. Real Postgres/RLS

- Use the application database role and real tenant RLS for enrollment grants, key epochs,
  capability challenges/submissions/admissions, one active connection epoch, consumed challenge and
  negotiated transcript, command ID/hash plus delivery/attempt mappings, outbox atomicity, inbox
  uniqueness, receipt/Enforcer/capability sequence-gap state, detector epochs, revocation, and
  cross-tenant denial.
- Prove state plus outbox commit together and a crash/retry creates no second semantic order.

### 4. Deterministic Runner saga without a model

- Real Postgres + real WSS + a tiny deterministic fake Harness Adapter/process.
- Claim → pre-spawn registration receipt → Enforcer arm outcome → every required secret-grant
  activation receipt → start delivery → ACK → durable spawn marker → signed start receipt → inbox →
  WF-230 transition worker. Prove no process can spawn before the three preconditions and exact
  retries create no second registration, grant activation, Enforcer authority, or process.
- Drive credential-provisioning no-start loss, signed no-process rejection, crash after spawn before
  receipt, partial grant failure/disposal, `human_input_required`, `policy_denied`, late receipt
  after fence, Enforcer arm/renew/fence duplicate/collision/gap, containment confirmation, Blocked
  resolution, and fresh claim with new lease/fence/nonce.

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
- Exercise #231's trusted Git transport broker with an exact signed old/new-SHA bundle. Prove stale
  preparation order and authenticated `exact_ref_publication_submission` handoff. Prove stale old
  SHA, wrong objects/ref/lease/fence/nonce, replay/collision, provider-health loss, and force-update
  attempts fail, and prove no GitHub installation/Contents-write credential enters Runner state or
  environment.

### 6. Secret canary

- Use an opaque named ref and temporary local grant Adapter with a unique canary.
- Assert the canary is absent from every WSS frame, Postgres row, outbox/inbox, Runner journal safe
  view, logs, errors, Slack/Ask Admin/MCP fixture, GitHub payload, diff/commit, checkpoint, and
  evidence summary, including harness environment and process listings.
- Race fence/revoke with use; distinguish local grant removal from upstream revoke confirmation.

### 7. Slack and Ask Admin HTTP contracts

- Real Slack handler with signed raw-body fixtures: bad signature/time, provider retry, wrong
  installation/team/user, unmapped/revoked Admin, stale target/version, expired/replayed nonce, role
  revocation, and exactly one bounded decision.
- Real authenticated Ask Admin route/tool call: on-behalf-of chain, turn/tool idempotency, caller-
  supplied authority ignored, no `operator.admin`, and no approval inference.

### 8. Canonical local-stack acceptance

- Drive one real-user, no-other-tab flow on a supported Linux fixture against the local stack: sign
  in through the browser, open Admin Runners, create a single-use enrollment, copy/run the real CLI
  bootstrap with grant over stdin, confirm the displayed fingerprint, explicitly select the pinned
  and probed **Codex CLI** Harness Adapter/tool/version in `managed_ordinary` mode, observe its
  challenge-bound Capability Admission, then assign a Todo DevTicket and invoke its real claim/start
  action. Run Codex CLI through the Adapter using a deterministic no-model process where possible
  and a bounded live smoke only for behavior that cannot be proved otherwise. Observe pre-spawn
  registration → Enforcer arm → secret activation → start receipt move the Card to In Progress.
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

- Run one Runner Protocol/Supervisor contract suite against Codex CLI and Claude Code pinned
  supported versions using deterministic no-model probes where possible and bounded live smoke only
  where vendor behavior cannot otherwise be proven.
- Run platform-specific Codex Desktop Adapter tests only on supported hosts.
  Unsupported/experimental rows must render unavailable rather than being skipped and called
  healthy.
- Run the same identity/wire/containment suite for local-machine and cloud-service enrollment;
  assert cloud never becomes an implicit failover and never advertises local Review.

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
- it designates this memo explicit **current input** in the migration manifest; the parent map must
  carry the matching pointer until #237 consumes it;
- it adds the official vendor/RFC sources to `docs/plan/official-docs.md` for implementation
  revalidation;
- it preserves frozen EXECUTION/grilling/consensus records and quarantined issue bodies.

## Resolution

Wayfinder #232 is resolved by an outbound, separately authenticated Runner role on Opzava's single
public broker WSS ingress; secure key-possession enrollment; versioned software compatibility
evidence; durable typed command delivery; domain-separated signed ordered receipts; independently
supervised Lease Enforcer, worktree/process/grant containment; fresh-claim-only recovery; and
provenance-only Slack, Ask Admin, MCP, and OpenClaw adapters. Execution Admission remains the sole
owner of DevTicket authority.

The protocol is deliberately transport- and harness-agnostic but not vague: Codex Desktop, Codex
CLI, Claude Code, local machines, and cloud services satisfy one exact conformance contract through
separate Adapters. No automatic failover, generic remote shell, self-asserted authority, secret
propagation, or old-lease resurrection is permitted.
