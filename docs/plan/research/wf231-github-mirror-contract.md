# WF-231 — GitHub App bootstrap and deterministic mirror contract

**Status:** prepared resolution candidate for Wayfinder issue
[`Reconcile GitHub bootstrap, two-way sync, delivery facts, Actions exceptions, and conflict remediation`](https://github.com/anthonykewl20/opzava/issues/231).
It becomes **current input** only after the parent map records #231's verified closure and
designates it for synthesis issue #237. Until then this is a reviewed contract candidate, not
implementation authority or product code.

## Decision summary

1. One Opzava-owned **GitHub Installation Binding** and one immutable **GitHub Repository Binding**
   replace both legacy credential planes: the `GITHUB_TOKEN`/PAT path used by Issues and the OAuth
   App device-flow token shown by Connections. Neither legacy connection may remain an alternate
   write authority after cutover.
2. The deep `DevBoard.GitHubIntegration` module owns tenant GitHub Installation Binding, GitHub
   Repository Binding, and GitHub Issue Binding records containing only the opaque public App
   configuration/rotation version; provisioning/security resolves the platform App Registration Ref
   internally. It also owns verified webhook ingress, short-lived installation-token minting,
   provider transport, the mirror inbox/outbox/conflict ledger, provider observations, **Mirror
   Shadows**, reconciliation, and dimensional integration health. It is a module inside the Dev
   Board bounded context, not a new bounded context or a second workflow authority.
3. Dev Board remains the sole workflow authority. A verified App webhook may request only the
   `wf230` App-source families; a GitHub Action may only append corroborated native check/deployment
   facts as observations, request field-code-only `ready.validate`, or open a Needs Human Approval
   Request for an eligible failed policy gate. Generic governed commands and deployment/rollback/
   release mutations reject absent an explicit versioned owner plus `wf230` policy change. No
   webhook, worker, label, Action, adapter response, or provider fact mutates lane, Ready,
   assignment, dependency, Sprint, approval, Review, Release, or Done state directly.
4. GitHub owns its native repository, Issue, comment, PR, provider branch/ref/SHA, commit, check,
   repository-review, and merge identities and facts. Opzava owns the current immutable work
   contract, its explicit draft or Ready-approved state, and all workflow decisions. Shared
   descriptive fields converge through a per-field three-way comparison rather than timestamps,
   delivery order, provider-side compare-and-swap, or blanket last-write-wins.
5. Webhook correctness is: bounded raw bytes, raw-byte HMAC verification, a strict non-persisting
   minimal signed-envelope parse, server-owned binding admission, full subscribed-schema parsing,
   Secret-Safe Ingress, durable normalized inbox receipt, then `2xx`. Raw payloads never persist.
6. An outbox makes attempts durable; it cannot make GitHub mutations exactly once. An ambiguous
   create/comment/body mutation enters `outcome_unknown`, reconciles stable correlation plus
   verified provider actor/identity, and never blind-retries. Identity-bearing Issue/comment effects
   with zero matches are never automatically reissued, because repeated provider scans are not proof
   that a delayed write does not exist.
7. Review issue #229 owns independent verdict and governed merge authorization. Runner issue #232
   owns worktree/process/receipt authority for automated conflict remediation. This integration
   detects, records, projects, and dispatches only already-authorized effects.
8. Unhealthy or unverifiable GitHub capability opens the scoped, unbypassable GitHub-health Absolute
   Stop from `wf230`. Recovery requires restored capability **and** a complete successful
   reconciliation; one successful API call is insufficient.
9. V1 accepts exactly the Opzava production repository. Owner/name is mutable routing/display data;
   numeric provider repository identity is authoritative. One fixed scratch repository is permitted
   only as test infrastructure.

## Locked inputs and non-goals

This memo consumes rather than reopens:

- `AcceptProposal` and `CreateBacklogDevTicket`, their stable create/link Mirror Outbox Intents, and
  the unique GitHub Issue Binding reservation
  (`docs/plan/research/wf230-devticket-command-model.md:657-700`);
- `MergeProposal`, which appends discovery/evidence to an existing DevTicket's planning history and
  opens a proposed Revision only when governed work changes; it creates no DevTicket, GitHub Issue
  Binding, Mirror Outbox Intent, or provider mutation (`wf230`:715-719);
- trusted command envelopes, authorization versions, idempotency receipts, and transaction-first
  external-effect rules (`wf230`:199-605);
- Secret-Safe Ingress, append-only corrections, Needs Human Approval Requests, Absolute Stops, and
  four-ledger routing (`wf230`:269-374, 1600-1783, 1984-2021);
- early/external merge containment and the rule that it cannot satisfy ordinary `AdmitDone`
  (`wf230`:1701-1706, 1873, 1942);
- the authority split and user-visible behavior in PRD-019, ADR-017, and DBF-079–102.

This memo does **not** implement schemas, ports, routes, workers, migrations, UI, or tests; define
Review internals; define the Runner wire protocol; authorize Releases; support multiple production
repositories; or require a GitHub Project.

## Official provider evidence checked

Checked against GitHub's current official documentation on 2026-07-17:

- [choosing GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app);
- [installation access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app);
- [setup URL security](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url)
  and
  [installation state](https://docs.github.com/en/apps/sharing-github-apps/sharing-your-github-app);
- [GitHub App user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
  and
  [installations accessible to the user token](https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token);
- [refreshing expiring GitHub App user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens),
  [OAuth authorization/token check and delete endpoints](https://docs.github.com/en/rest/apps/oauth-applications),
  and [credential revocation](https://docs.github.com/en/rest/credentials/revoke);
- [webhook signature verification](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries),
  [handling](https://docs.github.com/en/webhooks/using-webhooks/handling-webhook-deliveries),
  [best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks),
  [redelivery](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks),
  and
  [out-of-order delivery](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks);
- [webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads);
- [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api),
  [REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api),
  and
  [GitHub App endpoint permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps);
- [Issue](https://docs.github.com/en/rest/issues/issues) and
  [Issue-comment](https://docs.github.com/en/rest/issues/comments) APIs.
- [Deployment](https://docs.github.com/en/rest/deployments/deployments) and
  [Deployment Status](https://docs.github.com/en/rest/deployments/statuses) APIs.
- [GitHub Actions OIDC claims and verification inputs](https://docs.github.com/en/actions/reference/security/oidc).

The implementation pins `X-GitHub-Api-Version: 2026-03-10` behind one provider adapter constant.
Changing it is an explicit, tested adapter migration. Existing `2022-11-28` calls remain historical
evidence until that migration lands.

Provider constraints with architectural consequences:

- installation access tokens are short-lived (currently one hour), permission/repository scoped, and
  format-opaque; they are credentials, never product truth;
- the setup callback's `installation_id` is attacker-supplied until independently corroborated;
- GitHub expects a `2xx` webhook response within ten seconds;
- explicit redelivery reuses `X-GitHub-Delivery`; failed deliveries are not automatically
  redelivered and the redelivery window is bounded;
- deliveries can arrive out of order and expose no monotonic repository sequence;
- REST mutation success does not provide a general idempotency or compare-and-swap guarantee;
- label, milestone, or assignee updates can be silently ineffective when authority is insufficient,
  so a `2xx` attempt is not confirmation;
- primary and secondary rate limits have different recovery signals and must not be retried blindly.

## As-built inventory and disposition

### Current credential and health split

| Current path                                           | As-built behavior                                                                                                                                                                                                                                                          | Target disposition                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN` in the web and close-worker environment | `GitHubIssueTrackerAdapter` resolves a direct token or vault ref and calls Issue REST endpoints (`packages/adapters/src/github/issues.ts:144-358`; `docker-compose.yml:68-71`).                                                                                            | Quarantine during bounded dual-read, then remove. It never becomes a GitHub Installation Binding.                                               |
| Connections GitHub device flow                         | The provisioning worker uses a GitHub **OAuth App** device flow, requests broad `repo`, stores a user token in `SecretsVaultPort`, and calls only `/user` to declare Connected (`apps/workers/src/provisioning/connections-provisioning-service.ts:6416-6621, 6874-6982`). | Replace the UI and service with GitHub App installation. Provider revocation and local ref deletion are separately proven before retirement.    |
| `GITHUB_OAUTH_CLIENT_ID`                               | Enables the legacy in-memory device flow; a worker restart loses pending flows (`connections-provisioning-service.ts:3264, 6416-6500`).                                                                                                                                    | Remove after App cutover. No dual OAuth/App connect control remains.                                                                            |
| Current “Connected” state                              | `/user` success, or even vault-reference presence when no resolver is exposed, is treated as connected (`connections-provisioning-service.ts:6521-6577`).                                                                                                                  | Replace with dimensional App/installation/repository/permission/webhook/rate/outbox/reconciliation health.                                      |
| Disconnect                                             | Deletes the local secret ref only (`connections-provisioning-service.ts:6503-6518`).                                                                                                                                                                                       | Record provider revocation/uninstallation status and local-key/ref destruction separately. Never claim provider revocation from local deletion. |

### Current Issue and outbox substrate

| Current behavior                                                                                              | Evidence                                                                                                                                                                            | Carry forward / retire                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue-only port: list/get/create/close                                                                        | `packages/ports/src/issue-tracker.ts:3-51`                                                                                                                                          | Retire as public Dev Board boundary. Salvage provider-agnostic result/error patterns behind narrower capabilities.                                                        |
| Pull-style list sync, maximum ten 100-row pages, unconditional snapshot overwrite, missing rows ignored       | `packages/adapters/src/github/issues.ts:160-215`; `packages/project-management/src/application/issues.ts:383-447, 651-713`                                                          | Retire as correctness model. New reconciliation is complete, cursor/checkpoint based, three-way, and missing-aware.                                                       |
| Direct GitHub Issue creation from `/issues`                                                                   | `apps/web/lib/issues.ts:128-170`; `packages/project-management/src/application/issues.ts:720-803`                                                                                   | Retire. Accepted DevTicket transaction creates a stable intent; provider creation occurs later.                                                                           |
| Optional create idempotency key, not request-hash bound; provider success can precede failed projection write | `packages/project-management/src/application/issues.ts:281-296, 450-577, 720-803`                                                                                                   | Replace. Preserve every intent and reconcile orphan/ambiguous creates before cutover.                                                                                     |
| GitHub labels imply ready/in-progress/closed pseudo-workflow                                                  | `packages/project-management/src/application/issues.ts:345-369`; `apps/web/lib/issues-state.ts`                                                                                     | Retire. Managed labels are projections and command requests only.                                                                                                         |
| Task Done then separately enqueue Issue close                                                                 | `apps/web/lib/task-card-detail.ts:580-623`                                                                                                                                          | Retire. Done is admitted only from Review/merge proof; mirror close is a resulting outbox intent.                                                                         |
| Close-only outbox with `SKIP LOCKED`, reclaim, claim-token fencing, attempt/dead state                        | `packages/project-management/src/application/issues.ts:822-1068`; migrations `0006`, `0008`, `0009`                                                                                 | Salvage the RLS, claim, fencing, stale-finalizer, retry, and dead-letter lessons into a generic sync outbox. Linear fixed retry is replaced by provider-aware scheduling. |
| Tests prove RLS and close-worker races but not two-way provider behavior                                      | `packages/project-management/src/__tests__/slice25e-issues.integration.test.ts`; `packages/adapters/src/github/__tests__/issues.test.ts`; `tests/e2e/drives/connections-github.mjs` | Preserve as migration regression evidence; add the real seams below.                                                                                                      |

The configured repository constructor value is not presently enforced by every adapter call. The new
adapter accepts only an already-admitted GitHub Repository Binding; it never accepts an arbitrary
owner/name from a browser, agent, webhook field, or job payload.

## Ownership, modules, and durable records

### Bounded ownership

| Owner                               | Owns                                                                                                                                                                                                                                                                         | Must not own                                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DevBoard`                          | DevTicket aggregate; workflow commands; contract, lane, Ready, assignment, dependency, Sprint, approval, Review/Done admission decisions                                                                                                                                     | GitHub DTOs, App tokens, webhook signatures, provider retry policy                                                                                                                       |
| Platform provisioning/security      | environment App Registration Ref/config; private-key, client-secret, and webhook-secret refs/versions/rotation; global access audit                                                                                                                                          | tenant GitHub Installation Binding, GitHub Repository Binding, or GitHub Issue Binding records; DevTicket workflow; browser-visible secret refs or values                                |
| `DevBoard.GitHubIntegration` module | tenant GitHub Installation Binding, GitHub Repository Binding, and GitHub Issue Binding records carrying only opaque public App configuration/rotation versions; webhook inbox; mirror outbox; provider observations; Mirror Shadows; Sync Conflicts; health; reconciliation | App Registration Ref/identity, App secret refs/values/global rotation; direct lane/contract/approval/Done mutation; Review verdict; Runner process authority; a separate bounded context |
| `Review` (#229)                     | Independent Review run/result/evidence containment; merge authorization and exact proof correlation                                                                                                                                                                          | Treating repository review/checks as its verdict; ungoverned provider merge                                                                                                              |
| `Runner` (#232)                     | Signed local process/worktree/branch/command/heartbeat/checkpoint observations under Opzava-owned lease/binding/fence state; remediation execution                                                                                                                           | Lease admission/binding/fence authority; provider workflow authority; direct DevTicket mutation                                                                                          |
| GitHub                              | Native App/installation/repository/Issue/comment/PR/branch/ref/SHA/commit/check/repository-review/merge identities and facts                                                                                                                                                 | Opzava work contract or workflow decisions                                                                                                                                               |
| Projections/UI                      | Rebuildable Card/Development/health/conflict views and command affordances                                                                                                                                                                                                   | Alternate write authority or inferred gate passage                                                                                                                                       |

### Provider-agnostic capability seams

`wf230`'s `DevBoardMirrorPort` is the internal application facade consumed by Dev Board application
code and implemented by the `DevBoard.GitHubIntegration` module. The Integration module in turn
consumes the focused provider capabilities below rather than becoming one expanding provider adapter
or a renamed `IssueTrackerPort`:

- `CodeHostInstallationPort`: verify App identity, Installation state, repository access, granted
  capabilities, token minting, and provider revocation observations;
- `WorkItemMirrorPort`: fetch/create/update Issue body regions, managed-label deltas, milestone,
  state, and comments using immutable provider refs;
- `DevelopmentFactsPort`: fetch PR, branch/base/head, commits, checks/statuses, repository reviews,
  Actions runs, deployment observations, and merge facts;
- `CodeHostMergePort`: dispatch **only** a #229-authorized exact merge request and read its outcome;
- `AuthorizedGitRefUpdatePort`: accept a signed #232 Runner ref-update request/bundle only for an
  already-authorized branch/purpose/lease and perform the provider push inside a trusted transport
  broker; the raw write-capable installation token never reaches the Runner or worktree;
- `ProviderClockAndRatePort`: normalize response date, primary/secondary limit signals,
  `Retry-After`, reset, and conditional-read metadata.

GitHub DTOs end in the adapter. Domain-facing values carry stable provider IDs, safe normalized
facts, source hashes, observed/recorded times, and evidence refs.

### Required records

| Record                         | Stable key and important state                                                                                                                                                                                                                                                                                                                                                                                                     | Ledger                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| App Registration Ref           | platform-owned internal ID; provider App/client IDs; slug; API-version/config/permission/event-set versions; opaque public configuration/rotation versions; vault-only active/retiring private-key, client-secret, and webhook-secret refs plus rotation state; global access-policy version                                                                                                                                       | platform config audit    |
| Installation Association Proof | pending setup/Admin authorization versions; immutable GitHub user/account/installation/repository IDs; opaque public App configuration/rotation version; safe user-token API observations; provider-issued access/refresh expiries; exact cleanup operation/receipt including refresh `202 Accepted` as unconfirmed; local-zeroing states; consumed/expired/denied disposition; never token values or platform secret-ref versions | integration/config audit |
| GitHub Installation Binding    | tenant/workspace + provider installation ID; account ID; status; granted permission/event-set version; opaque public App configuration/rotation version; suspension/removal facts; never platform secret refs or secret-ref versions                                                                                                                                                                                               | sync/health              |
| GitHub Repository Binding      | one production binding; immutable provider repository ID/node ID; installation ID; canonical owner/name; opaque public App configuration/rotation version; rename/transfer/archive/delete state; never platform secret refs or secret-ref versions                                                                                                                                                                                 | sync/health              |
| GitHub Issue Binding           | unique DevTicket; verified-link reserves unique `(repository_id, issue_provider_id/number)` before acceptance, while create reserves a stable intent pending provider identity and confirmation attaches the same unique key; immutable origin plus exactly one create- or link-correlation UUID retained through every state/render                                                                                               | sync                     |
| Webhook Inbox Receipt          | `(opaque_public_app_config_key, delivery_id)`; raw-body SHA-256; event plus schema-valid action or explicit actionless disposition; admitted installation/repository; schema version; opaque public App configuration/rotation version; safe normalized payload ref; disposition; never platform App registration/secret-ref identity or version                                                                                   | sync inbox               |
| Mirror Outbox Intent           | Opzava event ID + operation + target + canonical request hash; state; claim token; attempt; not-before; unknown-outcome state; provider confirmation                                                                                                                                                                                                                                                                               | sync outbox              |
| Provider Observation           | provider object/ref/version-like observations, field digests, actor/app identity, observed/recorded times, source delivery or fetch epoch                                                                                                                                                                                                                                                                                          | sync                     |
| Mirror Shadow                  | last mutually confirmed per-field value digest plus Opzava version/event and provider object observation                                                                                                                                                                                                                                                                                                                           | sync                     |
| Reconciliation Epoch           | scope, cursor/pages, claimed generation/token, start/end snapshot, completeness, gaps, convergence result                                                                                                                                                                                                                                                                                                                          | sync                     |
| Sync Conflict                  | exact field/scope/base/Opzava/provider versions and safe values/refs; blocking class; monotonic conflict version; `open`, `decision_required`, `resolution_pending_mirror`, or `resolved`; resolution command/hash/ref and confirmation                                                                                                                                                                                            | sync/conflict            |
| Integration Health Snapshot    | dimension statuses, evidence, scope, evaluated policy version, last-good ref, reconciliation proof                                                                                                                                                                                                                                                                                                                                 | sync/health              |
| Actions Request Receipt        | unique `(issuer, jti)` and workspace/repository/family/nonce; audience/subject; workflow refs/SHAs; run/attempt/actor/event/ref/requested SHA; family-specific target and verified Provider Observation refs; canonical request hash; disposition; exactly one downstream Provider Observation, DevTicket command receipt, or owning-domain Needs Human Approval Request/command receipt                                           | sync/activity            |
| Authorized Git Ref Update      | exact #232 lease/purpose/ref/old/new SHA/bundle hash/nonce/expiry; broker claim/fence; provider attempt and confirmation; never token value                                                                                                                                                                                                                                                                                        | runner/sync              |
| GitHub Disconnect Saga         | unique binding generation selects exactly one saga; caller idempotency key/request hash are replay/collision metadata; outbound fence/drain; provider uninstall/revocation/expiry state including `provider_outcome_unknown` or `revocation_required`; local cleanup; terminal disposition; reconnect generation                                                                                                                   | sync/health/config       |

The App Registration Ref is environment/platform configuration, not tenant data. Only the
provisioning/security service may read it under an explicit global access policy; its secret values
and secret-ref identities/versions remain in the platform vault/config audit, never tenant queries,
application DTOs, or browser data. A tenant record may retain only an opaque public App
configuration/rotation version sufficient to detect drift without revealing which vault object or
secret-ref version was used. In particular, the active GitHub App client-secret value is resolved
only inside the bounded server-side authorization-code exchange, is never persisted outside the
vault or emitted to tenant/browser/log data, and is not retained by application state after the
request. Every other row is tenant scoped and RLS protected. Provider IDs are never inferred from a
URL. A renamed repository updates owner/name while retaining repository identity. A transferred
repository must still match the approved production binding and installation; otherwise it becomes
unverifiable.

## Verified GitHub input classification

Verification authenticates a provider fact; it does not grant workflow authority.

| Verified input                                                                               | Classification                                  | Allowed result                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| installation/repository lifecycle, token/permission/rate signal, App echo, provider deletion | integration-internal transition                 | update binding/health/inbox/outbox/reconciliation; open scoped stop/conflict as policy requires                                                                                                                                     |
| Issue/PR/comment/check/deployment/commit/review/merge identity and current native state      | provider fact only                              | append observation and rebuild projection; never infer a DevTicket decision                                                                                                                                                         |
| title or summary/context change with no concurrent Opzava change                             | governed shared-metadata request                | Dev Board validates actor/source/base/version and commits or rejects a new value; integration never writes aggregate directly                                                                                                       |
| managed contract/type/priority/risk/severity/area edit                                       | proposed Revision                               | create one exact-base Revision for Human Owner decision; no silent approved-contract replacement                                                                                                                                    |
| managed status, assignee, dependency, approval, or Sprint/milestone edit                     | governed command request                        | call the same Dev Board command as UI/Slack/agent; denial mirrors current truth or opens conflict                                                                                                                                   |
| OIDC-authenticated Actions request with exact repository/workflow/run/SHA/family binding     | exhaustive `wf230` Actions source policy        | append corroborated native check/deployment facts, request field-code-only `ready.validate`, or open one exact version/hash/nonce-bound Needs Human Approval Request for an eligible failed policy gate; every other family rejects |
| Issue close/reopen                                                                           | provider fact plus governed transition request  | close cannot mean Done/archive; reopen cannot undo Done; rejected/early state becomes visible conflict and reconciles                                                                                                               |
| provider GitHub comment                                                                      | actor-classified provider-backed append request | after Secret-Safe Ingress, only verified `mapped_human` appends a Human Comment; every other actor class remains external evidence                                                                                                  |
| App-authored hidden-marker comment/body/label echo                                           | integration confirmation candidate              | confirm only when App/installation/provider actor **and** expected outbox event marker/hash match                                                                                                                                   |

Free-text `#123`, branch names, commit messages, and copied hidden markers are hints only. They
never establish a binding, actor authority, or correlation on their own.

## GitHub App bootstrap and installation lifecycle

### Registration and requested capabilities

Opzava owns one GitHub App registration for this environment. Registration credentials live behind
secret references; they do not live in DevTickets, Cards, GitHub, Slack, logs, or docs. Private-key,
client-secret, and webhook-secret rotation has explicit current/retiring versions and provider-valid
overlap where supported. GitHub App expiring user access tokens must be enabled; setup fails closed
when that setting cannot be verified. A callback, code exchange, or delivery records only the opaque
public App configuration/rotation version used. The platform config audit separately records
secret-ref access under provisioning/security policy; a tenant record never stores or exposes a
platform secret ref or secret-ref version.

| Capability          | Permission    | Why                                                              | Write boundary                                                                           |
| ------------------- | ------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Repository Metadata | read          | stable repository/install metadata; required baseline            | never used as workflow authority                                                         |
| Issues              | read/write    | Issue create/body/state; labels; comments; milestones            | mirror intents and authorized provider transitions only                                  |
| Pull requests       | read/write    | PR/repository-review facts; create/update; #229-authorized merge | merge requires exact proof/authorization; no worker discretion                           |
| Contents            | read/write    | branch/commit/tree facts and authorized agent branch pushes      | only trusted transport broker receives write token; Runner submits one fenced ref update |
| Checks              | read          | check run/suite facts                                            | Opzava does not forge green checks                                                       |
| Commit statuses     | read          | legacy/status-context facts                                      | fact projection only                                                                     |
| Actions             | read          | workflow run/job facts needed on Card                            | no workflow dispatch/write in this contract                                              |
| Deployments         | read          | corroborate native deployment observations reported by Actions   | observation only; no deploy/rollback mutation                                            |
| Releases            | none for #231 | owned by Releases Gate if later required                         | add only through an approved #236 capability amendment                                   |
| Administration      | none          | not required for the one selected repository                     | never request merely to simplify setup                                                   |
| Workflows           | none          | Opzava does not edit `.github/workflows`                         | explicit future decision required                                                        |

`Contents: write` is powerful but required if the GitHub App is the credential source for governed
agent branch pushes. An installation token is repository/permission scoped—not branch scoped—and a
raw write-capable token never reaches a Runner, worktree, credential helper, environment, or log.
The trusted Git transport broker validates the signed #232 lease, purpose, exact ref, expected old
SHA, proposed new SHA, pack/bundle hash, nonce, expiry, and current base/head before performing one
provider push. Provider branch rulesets remain defense in depth, not the sole application fence. If
a deployment chooses a separate approved credential provider with equivalently enforceable ref
constraints, reduce App Contents to read and record that capability choice.

Subscribed event families are limited to the selected repository and needed lifecycle:

- automatic App lifecycle: `installation`, `installation_repositories`, and `installation_target`,
  including created, permissions accepted, suspend/unsuspend, repository add/remove, and delete;
- repository metadata: `repository`, `label`, `milestone`, `create`, `delete`, and `push`;
- work items: `issues` and `issue_comment`;
- development: `pull_request`, `pull_request_review`, `pull_request_review_comment`,
  `pull_request_review_thread`, `check_run`, `check_suite`, `status`, `workflow_run`, and
  `workflow_job`.

Unsupported event/schema pairs, or unsupported actions on an action-bearing schema, are durably
safe-ignored only after authentication, binding admission, schema classification, and Secret-Safe
handling. Action presence is defined by the exact event schema; `create`, `delete`, `push`, and
`status` are subscribed actionless events and must not be rejected for lacking `action`. An event or
action advertised as required but not supported by the current schema/config version makes that
capability unhealthy; it is not silently dropped.

### Secure install flow

1. An authenticated Opzava Admin starts `BeginGitHubInstallation` in secure UI. One transaction
   records tenant/workspace, expected App/config version, exact allowed repository identity/name,
   requester authorization version, one-time nonce, signed state hash, expiry, and `pending` state.
2. Opzava redirects to the App installation URL with opaque signed state. It never places a secret
   or tenant-readable identifier in the URL.
3. The setup callback checks state signature, expiry, single use, authenticated Admin session, and
   pending record. The `installation_id` query parameter is only a claim; the callback records no
   tenant binding and starts a separate one-time GitHub App user-authorization proof.
4. The same Admin completes the GitHub App web application flow under a second signed state/PKCE
   binding. For the authorization-code exchange, the provisioning/security service resolves the
   expected active GitHub App client-secret ref from the vault only for that bounded server call and
   submits the required client ID, client secret, code, exact redirect URI, and PKCE verifier. The
   secret value never reaches a tenant row, browser, response, error, or log and is not retained by
   application state after the exchange. The platform config audit retains the secret access and
   secret-ref version; the tenant proof retains only the opaque public App configuration/rotation
   version. Opzava uses the resulting ephemeral GitHub App **user access token** to call the
   provider's user-accessible-installations and repositories endpoints and requires the claimed
   installation/repository to appear for that exact authenticated GitHub user. It records only
   immutable provider user/account/installation/repository IDs and proof metadata. The resulting
   user and refresh credentials are held only as encrypted, non-exportable cleanup handles scoped to
   this pending proof; neither becomes a standing integration credential or tenant-readable ref. The
   proof records GitHub's issued access-token expiry and refresh-token expiry plus safe credential
   fingerprints, never values.
5. `FinalizeInstallationAssociationProof` uses only documented provider evidence. A successful App
   authorization/grant or token deletion records the exact `204` receipt; where applicable, an
   access-token check may additionally observe `404`. A documented `204` grant deletion proves only
   the credentials that GitHub documents as covered, while a token deletion/check proves only the
   access token. The credential-revoke endpoint returns `202 Accepted` for a refresh credential and
   exposes no status/introspection endpoint: the proof records that receipt as
   `refresh_revocation_accepted_unconfirmed`, not as revoked. Absent a later documented provider
   proof, the refresh cleanup handle remains quarantined until its recorded provider-issued expiry
   passes under the trusted clock. Only applicable `204`/`404` proof, later documented proof, or
   deterministic recorded expiry permits compare-and-set local handle/ciphertext destruction.
   Timeout, lost response, indeterminate reply, or unsupported cleanup remains
   `token_cleanup_unknown`/`revocation_required`, retains only the quarantined handle needed to
   reconcile, and blocks final binding and health. It never invents refresh-token introspection,
   treats `202` or local deletion as confirmed revocation, blindly repeats an unknown mutation, or
   exposes the credential to another worker.
6. Server-side App authentication independently fetches that installation and its repositories. It
   verifies App ID, installation/account, exact immutable repository ID, granted access, permission
   set, event/config version, and no existing binding to another tenant. A signed installation event
   may corroborate lifecycle state but cannot replace the user-to-installation association proof.
7. Under the pending-install and repository-binding locks, after the exact cleanup evidence above is
   complete and handles are locally zeroed, the same transaction revalidates the initiating Admin's
   live session, unchanged identity, current tenant membership, and current integration-admin
   authorization/policy version. It then confirms one GitHub Installation Binding and the one
   production GitHub Repository Binding, records health `reconciling`, and consumes state. A
   demotion, revocation, session expiry, tenant switch, or policy denial rejects finalization with
   no binding and expires/denies the pending proof safely.
8. A complete first reconciliation and managed-label capability probe must pass before health may
   become `healthy` or any Ready/provider-dependent gate may open.

A spoofed callback, missing/refused user authorization, user-token installation mismatch, mismatched
Admin session, reused state, wrong App/installation/account, second production repository,
repository ID/name mismatch, or binding collision records only safe security metadata and fails
closed. It never tenant-binds the claimed installation.

### Lifecycle drift and disconnect

- suspension, deletion, repository removal, lost permission approval, archived/deleted repository,
  or Issues-disabled `410` immediately invalidates affected capabilities and token minting;
- rename updates canonical display/routing name only after immutable ID verification;
- transfer is unhealthy/unverifiable until the same approved installation and ownership policy are
  re-established; it cannot silently move the tenant binding;
- permission additions remain pending until the installation owner accepts them; existing grants are
  evaluated exactly, not against desired configuration;
- unsuspend/reinstall never restores health by itself: mint/probe and full reconciliation must pass;
- `DisconnectGitHub` is a durable saga, not a local delete. The first authorized request locks the
  exact generation of the GitHub Installation Binding and GitHub Repository Binding and atomically
  records one `GitHub Disconnect Saga` keyed by caller idempotency key plus canonical request hash,
  marks the binding `disconnecting`, advances its outbound fence, rejects new token mint/claims, and
  snapshots every pre-fence Mirror Outbox Intent. Unclaimed intents that have provably not been sent
  become `cancelled_before_send`; claimed or possibly sent intents drain to confirmed,
  conflict-bound, or retained `outcome_unknown`. Ordinary workers cannot claim a pre-fence intent
  after the fence, and final disconnect cannot omit an unclaimed intent. A unique binding-generation
  constraint makes that saga the only one for the generation. Same-key/same-hash retries return it;
  same-key/different-hash rejects an idempotency mismatch; a different-key concurrent or later
  request returns `disconnect_already_started` with the existing saga reference and creates no
  second saga or provider action.
- The saga chooses the exact provider action from credential ownership and current policy: uninstall
  the dedicated App installation or revoke the legacy OAuth/PAT authorization when Opzava has
  verified authority; otherwise enter `revocation_required` and show one secure-UI provider action.
  A lost/ambiguous uninstall or revoke response enters `provider_outcome_unknown`. Reconciliation
  reads immutable installation/repository/authorization state: confirmed absent/revoked/expired may
  advance, still present returns to a bounded authorized attempt, and uncertainty remains
  fail-closed. It never blind-retries an unknown provider mutation or infers success from `404`
  without admitted identity and a complete provider observation.
- Local token/key/ref cleanup is a separately recorded phase. Only provider-confirmed uninstall,
  revocation, or expiry permits destruction/zeroing of tenant/legacy credential handles. Platform
  App registration secrets are not tenant-owned and are never deleted by disconnect. If provider
  action needs a human, the safe bindings/history and quarantined cleanup handle remain
  `revocation_required`; deleting a local ref is not success. Final `disconnected` requires the
  outbound drain, provider outcome, local cleanup, and retained-history proofs in one
  compare-and-set finalizer.
- Reconnect never revives or overwrites the prior binding. It is disabled while a disconnect is
  `provider_outcome_unknown`, `revocation_required`, or locally incomplete. After terminal
  `disconnected`, `BeginGitHubInstallation` creates a new setup proof and binding generation; all
  old provider identities, correlations, conflicts, and saga evidence remain immutable history.

## Webhook ingress contract

### Exact ordering

```text
bounded HTTPS request + content-type
  -> retain exact raw bytes only in bounded request memory
  -> HMAC-SHA256 X-Hub-Signature-256 verification against active/rotating secret versions
  -> constant-time compare
  -> read the bounded X-GitHub-Event schema hint, then strictly parse an event-family-specific
     minimal signed payload envelope (reject duplicate keys, wrong types, depth/size/count violations):
       action-bearing repository-scoped: action + installation.id + repository.id/node_id
       actionless repository-scoped (`create`, `delete`, `push`, `status`): installation.id +
         repository.id/node_id, with no required or invented action
       installation-scoped (`installation`, `installation_target`): action + installation.id
       installation-repository-set (`installation_repositories`): action + installation.id + bounded repositories_added/
         repositories_removed immutable id/node_id sets
  -> server-owned binding lookup and tenant admission from signed immutable IDs only:
       installation binding for installation-scoped lifecycle;
       installation + repository binding for repository-scoped facts;
       installation binding first, then each configured repository member for repository-set lifecycle
  -> full subscribed event schema and schema-specific action rule parse, exact envelope cross-check,
     and event-header/schema-family admission
  -> Secret-Safe Ingress over every content-bearing field
  -> one transaction: normalized safe inbox receipt + normalized facts + processing outbox
  -> 2xx (within GitHub's ten-second requirement)
  -> asynchronous command/fact/reconciliation handling
```

Nothing parses, logs, tenant-routes, or persists the body before signature verification. After HMAC
verification, `X-GitHub-Event` is read only as an untrusted, bounded schema-selection hint; GitHub's
payload signature does not authenticate that header. The minimal parser reads only the authenticated
payload routing envelope appropriate to that hinted family. It never assumes a singular repository:
installation lifecycle may carry none, repository-set lifecycle carries bounded immutable arrays,
and repository-scoped facts carry one. Within the repository-scoped family, the selected exact
schema determines whether `action` is required or absent; the parser never invents a sentinel action
for an actionless delivery. It performs no tenant lookup, free-text/content parse, persistence, or
logging. The binding lookup selects a tenant in memory from the signed installation and, where
required, repository IDs alone; the event header, owner/name, and all other payload fields remain
non-authoritative. Full parsing must reproduce the exact admitted envelope and prove that the
untrusted header names the subscribed event schema and that its action presence/value follows that
schema, or reject. Raw bytes are zeroed/released after the request and are never stored in product,
audit, dead-letter, debug, or raw logs.

### Deduplication and dispositions

The platform signature verifier selects the vault-backed App Registration Ref internally, then maps
it to one tenant-safe opaque public App configuration key/version before receipt creation. The
platform registration ID and secret-ref identity/version never enter the tenant receipt, RLS key,
DTO, or browser projection.

- key: `(opaque_public_app_config_key, X-GitHub-Delivery)`;
- same key + same raw-body SHA-256: return the original receipt/disposition and enqueue nothing;
- same key + different hash **after valid signature**: record safe collision metadata, make the
  provider ingress unverifiable, and open/reuse a scoped GitHub-health Absolute Stop;
- missing/malformed/invalid signature: reject before tenant lookup or receipt. A single unsolicited
  invalid request is a safe security metric, not attacker-controlled workflow state. Repeated or
  expected-delivery mismatch becomes health evidence only under a server-owned detector policy;
- cross-installation/repository or unbound-repository event: reject/safe-ignore after authenticated
  admission with no domain command; a change to the one bound repository opens health drift;
- oversized/unsupported content type: reject before parsing; no partial receipt;
- unsupported non-required event or unknown action on an action-bearing schema: safe normalized
  ignored receipt; missing/extra action against its exact schema, unknown required action, or schema
  drift: unhealthy capability and reconciliation, not guessed processing;
- suspected-secret content: persist no raw value. Record safe hash/detector/scope metadata, invoke
  the secret-exposure Absolute Stop, and require GitHub-side remediation/reconciliation.

`X-GitHub-Delivery` is never treated as sequence or chronology. The signed payload's immutable
installation/repository IDs may select only an existing server-owned binding; they cannot create or
change one. `sender`, owner/name, timestamps, and the untrusted event header are evidence or schema
hints, never tenant-routing authority. Because GitHub does not automatically redeliver failed
deliveries and manual redelivery is time-bounded, a gap always schedules snapshot reconciliation.

## Accepted-DevTicket mirror create and link transport

`wf230` owns the acceptance transaction. This contract begins with its committed
`GitHubIssueCreateRequested` or `GitHubIssueLinkRequested` intent.

### Create

1. The stable create intent carries DevTicket ID, GitHub Repository Binding ID, contract
   version/hash, renderer version, canonical request hash, and one unguessable public-safe immutable
   `create_correlation_id` UUID. It is allocated once per logical create intent, retained unchanged
   across that intent's numbered transport attempts, and never reused by another DevTicket or
   logical create intent.
2. The canonical Issue body includes `origin=create create=<create_correlation_id> link=none` inside
   the managed marker. Every later renderer/parser, Mirror Shadow, and pending or confirmed GitHub
   Issue Binding retains that exact origin/value; an outbox `event` identifies a mutable delivery
   attempt and can never replace or recover create identity. The outbox claim is fenced by claim
   token/generation and checks current binding/health before each attempt.
3. A definitive provider rejection records its normalized category. A retryable pre-send failure may
   back off. A timeout, connection loss after send, malformed success, or crash before provider
   confirmation enters `outcome_unknown`; it does **not** call create again.
4. Reconciliation enumerates fresh provider Issues through complete pagination/cursor checkpoints
   and matches exact repository, verified App actor/installation and creation-request facts,
   immutable `create_correlation_id`, and expected safe request characteristics. The dedicated
   create marker remains matchable after later contract/body renders or delivery-event changes;
   search-index hits and an `event` marker are hints, not create proof.
5. One candidate confirms provider Issue ID/node ID/number/URL under the unique binding lock.
   Multiple exact App-created candidates choose the earliest stable provider identity as canonical
   and deterministically mark/cross-link/close later duplicates using supported duplicate or
   `not_planned` semantics. They remain immutable sync history and never bind another DevTicket.
   **Zero candidates never proves absence**: even two or more complete identical traversals across a
   configured observation horizon leave the effect `outcome_unknown` and cannot automatically issue
   another create.
6. A version-bound Human Owner `ResolveUnknownMirrorEffect` decision may choose `keep_waiting`,
   `abandon_publication`, or `authorize_numbered_reattempt` only after showing the complete scan
   epochs, delayed-visibility warning, exact create intent/correlation, current binding and health,
   and possible duplicate consequences. It consumes a single-use approval and records the decision
   before a new numbered outbox attempt. A provider object that appears later is still reconciled by
   the immutable correlation; multiple matches follow the deterministic duplicate-containment rule
   above. This governed exception is not automated absence proof and never changes the stable create
   intent or correlation.
7. A candidate not provably created by this App/intent, a pre-existing marker collision, or an Issue
   already bound elsewhere opens Sync Conflict for Human Owner resolution. No automatic adoption or
   destructive cleanup occurs.

The Card remains Backlog with `GitHub mirror pending` until provider binding confirmation. It cannot
be Ready or claimable (`wf230`:686-692).

### Link verified existing

A fresh complete provider observation supplies immutable repository and Issue identities plus
observation version/hash. The stable link intent allocates one public-safe immutable
`link_correlation_id`, records `origin=link`, and never claims that Opzava created the provider
Issue. The canonical body uses `origin=link create=none link=<link_correlation_id>`; every later
renderer/parser, Mirror Shadow, and GitHub Issue Binding retains that exact origin/value. The Dev
Board command locks the unique binding key. Caller-provided URL or number, text marker, or search
result alone is never proof. If health/observation becomes stale before commit, the link rejects and
must be re-observed; acceptance is not partially preserved through an unverified external link. A
later body event cannot convert linked provenance to created provenance or fabricate a create UUID.

### Other uncertain mutations

Comments/worklogs use a stable hidden event marker, so an unknown post is reconciled by exact App
actor/installation + marker + safe body hash. Zero matches after any number of complete scans remain
`outcome_unknown`; the post is never automatically reissued because provider visibility has no
contractual absence horizon. The same version-bound `ResolveUnknownMirrorEffect` command may keep
waiting, abandon publication, or explicitly authorize a numbered reattempt after presenting and
recording duplicate risk. A late first post and any reattempt retain the same immutable event
correlation so reconciliation exposes and contains duplicates rather than treating both as distinct
work history. Body/label/state writes reconcile the fresh provider object against the expected
Mirror Shadow. GitHub's response code alone is an attempt; confirmation is an observed matching
provider identity/state. No mutation is blind-retried after an outcome becomes ambiguous.

Identity-bearing create/append effects—Issue creation and comment/worklog publication—require exact
provider object identity plus verified App/correlation evidence before their outbox intents confirm.
Semantically idempotent set fields—managed label membership, milestone, Issue state, and an exact
managed-body digest/readiness value—may converge without the missing delivery after a complete fresh
snapshot and three-way authority validation observes the exact intended state. That advances the
field shadow with the reconciliation observation, not a fabricated App actor/event. It never proves
an append/create effect, actor attribution, Ready approval, or absence of the whole-body race.

## Canonical GitHub Issue representation

### Body grammar

One shared human-editable summary/context region precedes exactly one managed block at the end:

```markdown
<human summary/context from the latest confirmed shared-field value>

<!-- opzava:work-contract:start devticket=<uuid> origin=create|link create=<uuid|none> link=<uuid|none> contract=<version> readiness=draft|ready-approved approval=<uuid|none> sha256=<digest> renderer=1 event=<uuid> -->

## Opzava Work Contract v<version> · <Draft|Ready approved>

<deterministic Secret-Safe Markdown rendered from the current immutable contract version>
<!-- opzava:work-contract:end devticket=<uuid> -->
```

The canonical renderer fixes field order, headings, list order, whitespace normalization, escaping,
and hash input. The digest covers the semantic current contract version, its explicit readiness
state, and exact Ready Approval ID or `none`, not provider line endings. A Backlog draft renders its
explicit missing fields and `Draft · Not Ready approved`; only the exact current Ready Approval may
render `Ready approved`. Mirror confirmation never implies Ready or approval. The immutable origin
and exactly one correlation are copied unchanged into every subsequent render, parser result, Mirror
Shadow, and GitHub Issue Binding: `origin=create` requires `create=<uuid> link=none`, while
`origin=link` requires `create=none link=<uuid>`. Changing, dropping, combining, or converting those
fields is an identity conflict. The outbox `event` UUID is only a delivery correlation and may
change between writes. It is neither create/link identity nor authority. The parser returns one of
`valid_expected`, `valid_changed`, `missing`, `duplicate`, `malformed`, `moved`, `trailing_content`,
`identity_mismatch`, or `renderer_unsupported`.

Only `valid_expected` confirms an echo. `valid_changed` creates an exact-base proposed Revision.
Every structural error opens managed-region Sync Conflict and prohibits destructive rewrite until a
fresh provider snapshot and Human Owner resolution. The worker never truncates surrounding text or
chooses one of duplicate markers. A copied/spoofed marker cannot authenticate an actor or event.

### Whole-body write limitation and compensation

GitHub updates an Issue body as one value and exposes no documented conditional-write/CAS
precondition. Therefore Opzava cannot promise lossless byte preservation when a human edits the body
between the App's final read and write. The UI, evidence, and operational contract must state this
irreducible provider limitation; a confirmation re-read proves resulting state, not that no
unobserved human edit was overwritten.

Outbound body updates use the narrowest compensating protocol:

1. load the current per-region Mirror Shadows and fetch/parse a fresh complete Issue;
2. if either region differs from its base, abandon the write and process the inbound change first;
3. after Secret-Safe handling, append an immutable pre-write Provider Observation containing the
   exact normalized summary/context and managed-region values/digests being protected, plus provider
   object/update observation and intended outbox event—never a raw payload;
4. fetch and compare once more; any drift abandons the attempt;
5. render the expected managed block around that latest confirmed shared region and perform one
   serialized whole-body write;
6. re-read and three-way compare. Advance shadows only for the exact observed result;
7. if webhook/observation evidence indicates an intervening edit, or resulting regions differ, open
   `potential_body_overwrite` Sync Conflict. Present the protected pre-write value, any
   authenticated intervening value, and current provider value side-by-side in Opzava; never
   auto-select or hide the risk. Human Owner restores/merges through a fresh governed command and
   mirror attempt.

This protocol reduces the race window and makes every observed value recoverable, but it cannot
recover an edit GitHub never exposes before overwriting. Affected UI/evidence says so plainly and
asks the human to resubmit that edit; it never claims a lossless two-way body primitive. A future
provider representation with partial/CAS writes may remove this limitation only through an explicit
contract migration.

### Managed labels and Milestone

| Family      | Cardinality                      | Meaning                                                                           |
| ----------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `type:`     | exactly 1 for accepted DevTicket | Feature, Bug, Improvement, Technical Task, Research/Spike, Maintenance            |
| `priority:` | exactly 1                        | P0–P3                                                                             |
| `risk:`     | exactly 1                        | Low/Medium/High/Critical                                                          |
| `severity:` | 0 or 1                           | only where Severity applies                                                       |
| `area:`     | 0+ in Backlog; 1+ before Ready   | canonical Work Areas                                                              |
| `status:`   | exactly 1                        | projection of Backlog/Todo/Blocked/In Progress/Review/Done, never authority       |
| `sprint:`   | 0 or 1                           | stable Sprint identity projection; name changes do not create a second membership |

Managed values use repository label definitions owned by an explicit taxonomy/config version. The
adapter applies per-label deltas and never replaces the whole label set. Every label outside these
families is GitHub-owned/unmanaged and preserved. Missing managed labels are recreated only from
confirmed Opzava truth; duplicate singleton families, unknown managed values, or externally changed
multiple status/sprint labels open field-specific conflict. Different `area:` values use set
three-way merge only when additions/removals are disjoint from the shared base.

Sprint also binds one GitHub Milestone per locked Sprint contract. A milestone edit is a Sprint Plan
request, not membership authority. A live delivery may confirm an expected App echo. When that
delivery is permanently missing, exact label/milestone set values may instead converge only through
a complete fresh snapshot, expected outbox hash/state, and three-way authority validation; no actor
or event is invented.

## Field authority and merge matrix

| Field/fact                                                         | Authority and outbound projection                                                                                       | Inbound GitHub change                                                                                                      | Conflict/blocking rule                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| DevTicket UUID                                                     | Opzava; hidden readable ref only                                                                                        | never accepted from caller/payload as binding proof                                                                        | identity mismatch is blocking/unverifiable                                                                                    |
| repository/Issue ID, number, URL, open/closed fact                 | GitHub native; binding stores immutable IDs                                                                             | observe; close/reopen also requests governed transition                                                                    | early close/reopen never means Done/archive; identity conflict blocks                                                         |
| title                                                              | shared descriptive value committed by Dev Board command                                                                 | GitHub-only change against common shadow requests metadata update                                                          | same-field divergence is non-execution-blocking unless policy classifies material                                             |
| summary/context region                                             | shared human content; Secret-Safe, preserved independently                                                              | GitHub-only edit requests shared metadata update                                                                           | same-field divergence visible; content secret opens Absolute Stop                                                             |
| managed Work Contract/readiness                                    | Opzava current immutable contract + exact Ready Approval or explicit draft/no approval                                  | valid edit creates Revision; readiness/approval edits are command requests only                                            | contract/marker/readiness conflict blocks Ready/execution; mirror echo never grants approval                                  |
| type/priority/risk/severity/area labels                            | Opzava contract/classification projection                                                                               | creates exact-base Revision or taxonomy command request                                                                    | governed same-family conflict blocks affected gates; malformed multiplicity conflicts                                         |
| status label                                                       | Opzava lane projection                                                                                                  | governed lane command request                                                                                              | denial snaps/mirrors truth; concurrent status conflict pauses affected execution                                              |
| unmanaged labels                                                   | GitHub native/display                                                                                                   | observe/preserve; optional human metadata only                                                                             | never deleted; no workflow effect                                                                                             |
| GitHub assignees[]                                                 | only a provider-projectable mapped-human Execution Assignee mirrors; agent/non-projectable assignees remain Opzava-only | deterministic mapped-set classification below requests assignment changes only when provider-projectable authority differs | multiple mapped provider identities block start; zero mapped is valid for Opzava-only assignee; Human Owner is never inferred |
| dependencies/approvals                                             | Opzava only; readable managed block summary                                                                             | managed edit proposes Revision; free text is hint                                                                          | conflict blocks execution                                                                                                     |
| Sprint label/Milestone                                             | Opzava Sprint/Plan projection                                                                                           | requests exact Sprint Plan revision                                                                                        | conflict blocks Sprint admission/ordering                                                                                     |
| provider Comments                                                  | append-only Dev Board activity + one provider comment binding                                                           | only `mapped_human` becomes Human Comment; other actor classes remain attributed external comments                         | edits append correction; deletion creates safe tombstone/redaction pending #235; copied markers grant no authority            |
| agent Worklogs                                                     | Runner owns signed worklog; Dev Board links; expected App posts one meaningful milestone comment                        | exact expected-App echo confirms; third-party/unknown lookalikes remain external content                                   | correction appends and names original; raw telemetry never mirrors; provider actor never invents agent authority              |
| Review summary                                                     | #229 result/evidence projection                                                                                         | provider edit/deletion is integrity conflict                                                                               | never changes Review verdict; relied-upon corruption blocks Done                                                              |
| provider PR/branch/ref/commit/check/status/repository-review facts | GitHub native facts correlated to immutable provider identity and exact Runner branch/SHA refs                          | observe normalized provider facts                                                                                          | green/native approval is not independent Review; provider fact never owns Runner execution                                    |
| execution lease/governed branch-purpose binding                    | Opzava Dev Board owns authorization, binding, fence state, and accepted correlation refs                                | Runner supplies signed local worktree/branch/process/checkpoint observations; GitHub supplies native ref/SHA observations  | mismatch invalidates correlation/evidence; neither GitHub nor Runner can create, replace, or authorize the binding            |
| merge fact                                                         | GitHub native                                                                                                           | observe exact base/head/merge commit and actor                                                                             | external/early merge opens blocking conflict and Post-Merge Review                                                            |

GitHub exposes a replaceable assignee array, while v1 has at most one Execution Assignee. An
assignee is **provider-projectable** only when the exact current Opzava human identity has an
explicit immutable GitHub-user mapping. AI agents, local/orchestrator identities, and humans without
that mapping are **Opzava-only** and never receive a fabricated provider identity. The adapter
resolves the full fresh provider array through explicit mappings and classifies it
deterministically:

- zero mapped provider identities: converge when Opzava is unassigned **or** the current Execution
  Assignee is Opzava-only; if the current assignee is provider-projectable, classify provider
  removal against the common shadow and use the ordinary governed request/outbound correction rules;
- exactly one mapped provider identity: converge only when the current Execution Assignee is that
  provider-projectable human. If Opzava is unassigned, projectable to someone else, or assigned to
  an Opzava-only agent/human, submit the ordinary exact-version provider-backed assignment request;
  denial retains Opzava authority and mirrors/removes only the mapped provider delta;
- more than one mapped identity: open `assignee_cardinality_conflict`, choose none, and block start;
- any mapped count plus unmapped identities: preserve and display every unmapped identity as a
  GitHub-native collaborator with no Human Owner, assignment, approval, or workflow authority.

Outbound sync uses provider add/remove-assignee delta endpoints only for the current
provider-projectable assignee and mapped provider identities. An Opzava-only assignee projects a
managed mapped-provider set of zero without unassigning the Opzava identity. Sync never replaces the
whole array or removes an unmapped identity. A post-delta complete re-read applies the same
cardinality rules; a concurrent change becomes a conflict rather than an arbitrary first assignee.

Same-field divergence means both current Opzava and provider values differ from their last confirmed
base and from each other. Equal final values converge even if both changed. Disjoint fields merge.
Contract, dependency, assignment, approval, Sprint, managed-status, Review-integrity, and merge
conflicts pause affected execution. Harmless title/unmanaged-display conflicts do not stop unrelated
work.

### Comment/worklog identity and provider actors

Opzava-originated comments use a final hidden line:

```markdown
<!-- opzava:mirror event=<uuid> stream=comment|worklog|review record=<uuid> correction_of=<uuid|none> -->
```

The binding stores Opzava record/event ID, provider comment ID/node ID/URL, provider actor ID/App
ID, creation observation, and safe content hash. Confirmation requires the expected outbox record,
verified App installation/actor, marker, and matching safe hash. A marker pasted by a human never
confirms an App write. GitHub edits import as a new correction naming the original provider comment;
they do not overwrite the prior Opzava record. Deletion records provider deletion and a safe
tombstone; exceptional cross-system removal is resolved by #235.

Every inbound provider comment stores immutable provider actor ID/node ID where available, provider
actor kind, safe display snapshot, mapping evidence/version, and exactly one normalized class:

- `mapped_human`: a verified provider user identity mapped to one current Opzava human; only this
  class may append a Human Comment under that human identity after Secret-Safe Ingress;
- `expected_opzava_app`: the admitted App/installation identity; it may confirm only the exact
  correlated outbox comment/worklog/review record and never invent the underlying human or agent;
- `third_party_app_or_bot`: any other App, bot, automation, or integration identity; retain it as a
  provider-backed external comment with its external actor identity and zero human, agent,
  assignment, approval, or workflow authority;
- `unknown_or_deleted`: missing, deleted, unmapped, or unverifiable actor identity; retain the safe
  provider-backed external comment and uncertainty, with zero authority.

Actor names, `User`-looking bot logins, body attribution, and hidden markers never upgrade a class.
A marker copied by a mapped human, third-party App/bot, or unknown actor is ordinary provider
content or a visible collision, never App confirmation. Even the expected App confirms only when
installation, provider comment identity, expected outbox record, marker, and safe hash all match.

## Deterministic three-way reconciliation

### Per-field algorithm

For every field `f`:

- `B`: last confirmed Mirror Shadow value/digest, Opzava version/event, provider observation;
- `O`: current authoritative Opzava value/digest and version;
- `G`: fresh complete GitHub snapshot value/digest and provider identity/observation.

| Condition                                    | Outcome                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `O == B && G == B`                           | converged; no write                                                                                |
| `O != B && G == B`                           | queue/confirm Opzava projection to GitHub                                                          |
| `O == B && G != B`                           | classify GitHub change and submit provider-backed command/fact                                     |
| `O == G`                                     | converge shadow to the equal result after authority/command validation                             |
| both changed on different independent fields | apply both through their proper owner, then confirm                                                |
| `O != B`, `G != B`, `O != G` on same field   | open/reuse Sync Conflict; no last-write-wins                                                       |
| provider object missing                      | first verify installation/repository/permission health; then classify deleted/unavailable/conflict |

`updated_at`, delivery time, ETag, and observation time assist scheduling/debugging but are not
authority or per-field versions. Provider facts are append-only observations. A newer timestamp does
not overwrite a governed decision.

### Snapshot epochs and worker safety

1. Reconciliation claims one scope generation with a claim token. Stale workers cannot advance
   cursors, shadows, health, conflicts, or outbox confirmations.
2. Targeted reconciliation follows every admitted webhook and ambiguous mutation. Periodic full
   reconciliation covers installation, exact repository, every active/archived/historical Issue
   binding in retention, stable complete current comment-ID membership for every retained Issue plus
   content changes since checkpoint, managed body/labels/milestone/state, and explicitly correlated
   development facts. An incremental checkpoint or one exhausted mutable page traversal cannot prove
   absence.
3. Each membership traversal continues until provider end and records canonical sorted comment IDs/
   node IDs, safe content/update fingerprints, page boundaries, parent comment count/update/ETag
   observations when available, rate observations, and restart checkpoint. Because GitHub does not
   expose a transactional collection snapshot, deletion/absence requires **two consecutive complete
   traversals** with identical canonical membership and fingerprints plus unchanged available
   start/end collection observations. Any concurrent add/delete/edit, page shift, boundary drift, or
   fingerprint mismatch restarts the membership proof. Persistent drift leaves the epoch incomplete
   and health/reconciliation truthful; it never declares deletion.
4. Only that stable repeated traversal may mark a bound comment missing/deleted and establish the
   bounded comment-membership watermark. Other collections use their named complete-snapshot rule. A
   partial or unstable epoch cannot declare absence or health. A sequence gap is not inferred from
   webhook numbers; it is any expected fact/outbox/provider relationship that cannot be accounted
   for.
5. Worker mutations are serialized/paced per installation/repository. Retry scheduling honors
   `Retry-After`, `x-ratelimit-reset`, zero remaining, secondary-limit minimum wait, then
   exponential backoff with bounded attempts and jitter. Continuing during a limit is forbidden.
6. Dead letters remain visible. `RequestSyncReplay` is an authorized integration command bound to
   the original intent/request hash, current health and target state; it cannot change the intended
   domain operation or bypass a conflict.
7. `401`, ordinary `403`, rate `403/429`, `404`, `410`, `422`, redirects, `5xx`, timeouts, and
   invalid responses are distinct normalized categories. `404` is not deletion until repository
   access and permission health are proven; `410` may mean Issues unavailable and is a capability
   loss.

An epoch is `converged` only when it is complete; every binding is accounted for; all nonterminal
outbox attempts are confirmed, safely retryable, or represented by a visible conflict/stop; provider
facts needed by a gate are fresh; no unknown mutation outcome remains; and every field's shadow
matches the accepted owner state or an explicit unresolved conflict.

### Governed unknown identity-bearing effect resolution

`ResolveUnknownMirrorEffect` is the only command that may terminalize or reattempt an ambiguous
Issue-create or comment/worklog-publication effect when reconciliation has found zero exact
candidates. Zero scans never make it an automated worker command. An authenticated Human Owner uses
the Opzava form; an App, Action, Runner, agent recommendation, webhook, or outbox worker cannot
authorize it.

Its trusted command envelope and canonical request hash bind the unknown-effect ID and version;
effect kind; original stable intent, immutable correlation and safe request hash; exact App, GitHub
Installation Binding, GitHub Repository Binding, and DevTicket; every complete observation epoch
shown to the human, including time range and canonical membership fingerprints; current
binding/shadow/health and reconciliation versions; the choice `keep_waiting`, `abandon_publication`,
or `authorize_numbered_reattempt`; the explicit delayed-visibility/duplicate-risk acknowledgement
for a reattempt; actor/session/authorization/policy versions; one-use approval nonce; and
idempotency key.

The command locks the unknown effect, intent, binding, current observations, outbox, and receipt in
canonical order. It rejects with zero writes if an exact candidate now exists, any version or hash
changed, reconciliation is incomplete/stale, provider health is not sufficient for the chosen
action, another reattempt exists, authorization changed, or the approval was expired, revoked, or
consumed. `keep_waiting` records the decision and retains the live unknown. `abandon_publication`
records a visible terminal non-publication outcome without claiming provider absence or deleting a
late object. `authorize_numbered_reattempt` atomically consumes the approval and creates one new
numbered outbox attempt under the unchanged stable intent/correlation with
`duplicate_risk_accepted`; it neither confirms the effect nor advances a Mirror Shadow.

A late original or multiple exact candidates always re-enter immutable-correlation reconciliation.
The canonical binding/record is selected by stable provider identity and later duplicates are
contained/cross-linked or append-corrected without erasing history. Same key/hash replays the
recorded result; racing resolutions, observations, and late provider appearance admit one outcome
under the same locks. Activity owns the Human Owner decision; the sync ledger owns observations,
unknown state, outbox attempts, provider bindings, and duplicate containment.

### Governed Sync Conflict resolution

`ResolveSyncConflict` is the only command that may select a same-field resolution. It is a Dev Board
application command, not an Integration worker shortcut. An authenticated Human Owner uses the
Opzava conflict form; GitHub, Actions, a Runner, an agent recommendation, or an outbox worker cannot
authorize it.

The trusted command envelope and canonical request hash bind:

- Sync Conflict ID and expected monotonic conflict version;
- DevTicket, GitHub Installation Binding, GitHub Repository Binding, GitHub Issue Binding, and field
  key;
- exact base Mirror Shadow ID/digest and Opzava version/event;
- exact current authoritative Opzava aggregate/contract/value version and safe digest;
- one complete fresh Provider Observation ID/epoch, provider object/update observation, and safe
  value digest;
- one choice: `keep_opzava`, `accept_github_through_owner`, or `apply_explicit_merge_through_owner`,
  with a Secret-Safe normalized explicit value/digest only for the last choice;
- actor/session, current authorization and policy versions, one-use nonce, idempotency key, and
  canonical request hash.

The command locks the DevTicket aggregate, conflict, Mirror Shadow, provider observation, and
idempotency receipt in their canonical order. It rejects without writes when the conflict is not
open, any expected version/hash/binding changed, the provider observation is incomplete or stale,
health/Absolute Stop policy forbids the action, authorization changed, or a newer provider/domain
value exists. It refreshes/reuses the conflict under a new version rather than applying a stale
choice.

The choice never bypasses the field owner:

- `keep_opzava` retains the exact current authoritative value;
- `accept_github_through_owner` submits the observed value through the ordinary owner command;
- `apply_explicit_merge_through_owner` submits the explicit value through that same command.

Contract/readiness/classification/dependency/assignment/Sprint/approval fields therefore still use
their ordinary Revision, approval, materiality, and gate rules. If that owner command requires a
separate decision, the Sync Conflict becomes `decision_required`, links the exact Revision/request,
remains blocking, and emits no mirror write. The Human Owner resolves that decision and then invokes
a fresh conflict version; conflict resolution never silently accepts a managed-body edit.

Once the chosen authoritative value is valid, one transaction records the command/activity result,
moves the conflict to `resolution_pending_mirror`, and creates exactly one Mirror Outbox Intent
bound to the selected value, current provider observation, conflict version, and request hash. It
does not advance the Mirror Shadow or claim `resolved`. If the provider already equals the selected
value, a complete authoritative observation may confirm immediately under the same rules. Otherwise
only a post-write complete observation of the exact selected value advances the shadow and marks the
conflict `resolved`. Provider drift, an ambiguous body write, or a concurrent webhook keeps the old
evidence, supersedes the pending attempt safely, and opens/refreshes a conflict; it never overwrites
or last-write-wins.

Same idempotency key/hash replays the recorded result with zero writes. A different hash, two Human
Owners racing one conflict version, conflict refresh racing resolution, or a stale outbox finalizer
admits one winner under the conflict/version/claim locks; every loser receives the current conflict
version and values. Activity owns the human decision, the sync ledger owns conflict/shadow/outbox/
provider confirmation, and planning owns only a linked rationale when the choice changes the work
contract.

## Provider-native development facts

### Trusted correlation

A development fact binds only through:

- immutable GitHub Repository Binding and provider PR/resource IDs;
- the Opzava-owned Execution Lease and governed branch/purpose binding correlated to authenticated
  Runner worktree/local-branch observations;
- exact base repository/ref/SHA, head repository/ref/SHA, locked candidate SHA, and merge-tree/merge
  commit where available;
- an explicit PR binding created by an authorized command or confirmed App action.

Issue mentions, titles, branch-name substrings, commit-message text, and arbitrary backlinks are
hints. They may propose correlation but never attach facts automatically.

Force-push or head/base drift appends a new provider observation, invalidates SHA-bound evidence,
and triggers Review/reconciliation policy. GitHub `mergeable` may be `unknown` or stale; conflict
detection waits for conclusive base/head evidence or records inconclusive state. Repository-native
approvals and green checks display on the Card but never substitute for #229 independent Review.

### Governed merge and early/external merge

The merge outbox exists only after #229 locks the exact Review Exit Containment Proof, merge
authorization, candidate/base/head/merge-tree, policy, and idempotency identity. Before dispatch it
rechecks those bindings and repository health. After dispatch, GitHub's exact merged state, actor,
base/head, and merge commit must be observed and correlated before `AdmitDone` may consume it.

Any merge observed before that proof/dispatch, from another actor, or with mismatched base/head is
an external-merge Sync Conflict. Preserve the native merge fact, retain Review membership/WIP and
containment, revoke remaining merge authority, and require a fresh Post-Merge Review against the
actual merge commit. Never auto-revert, fabricate authorization, or call ordinary `AdmitDone`.

## GitHub Actions requests

Webhook `workflow_run`, `workflow_job`, check/status, label, comment, and actor facts cannot carry
or authenticate an Opzava command. They remain provider facts/projections only. An
Actions-originated request uses one explicit OIDC protocol:

1. An allowlisted workflow/job with `id-token: write` requests a short-lived GitHub OIDC token for
   the exact Opzava Actions audience and posts it plus a canonical structured request to the Opzava
   Actions endpoint. No long-lived Opzava secret is stored in GitHub.
2. Before reserving an Actions Request Receipt, Opzava verifies JWT algorithm/key against GitHub's
   current OIDC discovery/JWKS, exact issuer/audience/subject, time bounds and single-use `jti`;
   immutable GitHub Repository Binding ID; `ref`, head/base/SHA where applicable; `workflow_ref`,
   `workflow_sha`, optional allowlisted `job_workflow_ref`/`job_workflow_sha`; `run_id`,
   `run_attempt`, `actor_id`, and event/environment policy. Native check facts require an
   independently fetched App/provider check observation bound to repository, check/run, ref, and
   SHA. Native deployment facts require either an independently fetched `Deployments: read`
   observation or an exact #236-owned admitted Provider Observation, bound to provider deployment/
   status identity, repository, run, ref/SHA, and environment. The request payload is never its own
   corroboration; absent, stale, or mismatched provider evidence rejects with zero receipt.
3. The canonical request binds one exhaustive `wf230` family and its exact target: the verified
   check/deployment Provider Observation; the DevTicket and expected contract/policy versions for
   `ready.validate`; or the owning aggregate, exact failed policy-gate evaluation, target/version/
   hash/policy, and exception eligibility for a Needs Human Approval Request. It also binds the safe
   payload hash, one-use nonce, and exact OIDC/run claims.
4. In one transaction, Opzava reserves unique `(issuer, jti)` and
   `(workspace_id, repository_id, family, nonce)` keys plus canonical request hash and one Actions
   Request Receipt with exactly one downstream result. A native check/deployment fact appends one
   Provider Observation in the sync ledger and no command receipt. `ready.validate` commits its
   matching DevTicket command receipt. An eligible failed policy gate commits the actual owning
   aggregate's Needs Human Approval Request and command receipt. Same keys plus the same hash replay
   only that recorded result. A different hash, concurrent reuse, stale evidence, unapproved
   workflow revision, fork/untrusted event, missing claim, ineligible gate, or family outside the
   versioned source-policy row rejects with zero partial receipt. Only the two command-request
   families enter their owning trusted command boundaries.

Free text, temporal proximity, `github-actions` actor/label, copied marker, or webhook facts alone
are insufficient correlation.

Actions may:

- report corroborated native check/deployment facts as append-only Provider Observations;
- request `ready.validate` with only the field-code-safe result allowed by `wf230`;
- request a Needs Human Approval Request for an eligible failed policy gate, tied to exact owning
  target/version/hash/policy/nonce.

Actions may not approve its own request, claim a human identity, directly change a DevTicket, bypass
either Absolute Stop, turn a GitHub close/green check into Done, grant merge authority, request a
generic governed command, or request a deployment/rollback/release mutation. The exhaustive v1
source policy is corroborated native check/deployment fact append, `ready.validate`, and an exact
Needs Human Approval Request for an eligible failed policy gate only. Any wider family requires an
explicit versioned change by that family's owning domain plus a matching `wf230` source-policy
amendment; adapter configuration alone cannot widen it. The UI label for an eligible blocked request
is `Needs Human Approval`, never “policy bypassed.”

## Automated merge-conflict remediation

1. The `DevBoard.GitHubIntegration` module observes conclusive PR conflict/base-head evidence and
   creates/reuses one `MergeConflictRemediationRequested` record bound to DevTicket, PR, base/head
   SHAs, conflict generation, and policy. An `unknown` mergeability observation only schedules
   refresh.
2. Dev Board authorizes the exact remediation under current contract, lease/capacity, conflict,
   health, and Review policy. The integration never starts an agent.
3. #232 provisions a fenced Runner attempt in an isolated worktree/branch with one-use command
   nonce, exact permitted head branch, and signed receipts/checkpoints. The Runner submits a signed
   exact-ref update/bundle to the trusted Git transport broker; it never receives the raw
   write-capable installation token and has no authority to merge the base branch or change workflow
   state.
4. Base/head or PR state drift before push cancels/supersedes the attempt. The Runner rebases/merges
   the current base, resolves agent-authored conflicts, runs affected real checks, and pushes only
   the authorized head.
5. Provider observation of the new head SHA confirms the effect. The new SHA invalidates stale
   evidence and returns through independent Review. It never inherits an earlier verdict.
6. Repeated conflicts, ambiguous push outcome, provider rejection, or bounded-attempt exhaustion
   remains visible and notifies the Human Owner/Slack through the normal notification outbox.

`Authorized Git Ref Update` has its own durable compare-and-reconcile lifecycle. Before transport,
one transaction locks the current provider observation and exact #232 remediation attempt, verifies
the expected old SHA, and records `prepared` with ref, old/new SHAs, bundle hash, lease/fence,
one-use nonce, expiry, request hash, and broker claim. Dispatch advances that same record to
`attempted`; same-key/same-hash retries return it and never launch another remediation run or
provider push.

A lost response, timeout after send, or broker crash before confirmation enters
`push_outcome_unknown` and fences the remediation attempt. The only next effect is fresh exact-ref
reconciliation under the same record:

- the ref at the intended new SHA confirms the original update and records provider evidence;
- the ref still at the expected old SHA remains bounded unresolved: scheduled observations and an
  expiry/escalation deadline prevent an infinite hot loop, but old SHA is never treated as proof the
  provider did not accept a delayed update and never authorizes a blind second push;
- the ref at any third SHA records `ref_conflict`, preserves all three identities/evidence, cancels
  the stale authorization, and requires a fresh conflict/remediation decision and exact-ref update.

Late observations compare-and-set against the same terminal/unknown record. They cannot confirm a
superseded attempt, create a second run, or overwrite a third-SHA conflict. A bounded-unresolved
old-SHA result stays visibly blocked for Human Owner reconciliation; any new attempt requires a new
authorization/nonce after the prior record is terminally superseded under fresh provider facts.

Synchronization and conflict classification require no model tokens. A model may perform the
Runner-owned code repair, but deterministic state, identity, policy, and reconciliation remain the
correctness oracle.

## Integration health and Absolute Stops

### Dimensions

| Dimension               | Healthy evidence                                                                                      | Failure consequence                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| App authentication/key  | active App identity; usable current key ref; rotation version known                                   | no token mint/provider admin calls; repository capability unverifiable                                |
| Installation            | exact active installation/account; not suspended/deleted                                              | affected repository unhealthy                                                                         |
| Repository              | immutable ID reachable under installation; expected owner/name/state                                  | removed/transfer/delete/archive/Issues-disabled scopes stop                                           |
| Permissions/events      | exact granted minimum; required event/schema/config versions supported                                | missing read makes facts unverifiable; missing write pauses that outbound capability                  |
| Token mint              | short-lived token minted, format opaque, expiry tracked, no persistence                               | pause dispatch; expiry retries mint, never reuses token                                               |
| Webhook ingress         | current/rotation signature health; authenticated receipts; expected-delivery/failed-delivery evidence | signature/config mismatch or unexplained gap schedules reconcile; verified collision is stop evidence |
| Rate budget             | primary remaining/reset and secondary backoff clear                                                   | degraded/paced; fact gate waits if fresh read unavailable                                             |
| Inbox/outbox            | bounded oldest age/attempts; no unknown mutation or unexplained dead letter                           | outbound-only pause or fact unverifiability by operation/scope                                        |
| Snapshot/reconciliation | complete recent epoch; all bindings accounted; shadows/conflicts explicit                             | stale/partial/nonconvergent scope is unverifiable                                                     |

### States and gate effects

- `healthy`: every required capability and complete reconciliation proof is current.
- `degraded`: last-confirmed data is readable and identity/authority remain verified, but a
  transient `5xx`, rate wait, bounded lag, or nonessential capability delays freshness. Pause only
  affected outbound/fresh-fact gates; do not fabricate current data.
- `unhealthy`: a known required capability is lost—invalid App key, suspended/deleted installation,
  repository access/permission/event loss, Issues disabled, or confirmed provider rejection.
- `unverifiable`: identity, authenticity, mutation outcome, required provider fact, or complete
  convergence cannot be established—valid delivery-ID/hash collision, repository identity drift,
  unknown mutation, required schema mismatch, incomplete snapshot past policy, or nonconvergent
  binding.

Unsolicited invalid internet traffic does not let an attacker open a workflow stop. A server-owned
detector must connect the evidence to the configured App/binding or an expected delivery.

Known outbound-only permission loss pauses those operations. Loss of read/auth/repository/signature
or required correlation makes facts unverifiable. `unhealthy` or `unverifiable` opens/reuses
`OpenAbsoluteStop(type=github_health)` at the narrowest
installation/repository/capability/DevTicket/fact scope. `wf230` atomically blocks dependent gates
and contains affected starting/active work; unrelated last-confirmed projections stay readable with
freshness/status labels.

Resolution requires:

1. current App/key/installation/repository/permission/event/token probes;
2. no unresolved ambiguous mutation or binding conflict in scope;
3. a complete post-repair reconciliation epoch with required provider facts fresh and shadows
   converged or conflicts explicitly resolved;
4. affected outbox/inbox dead/unknown work drained, superseded, or safely conflict-bound;
5. current policy authorization and exact Absolute Stop version.

`ResolveAbsoluteStop` records only recovery. It grants no Ready Approval, exception, claim, Review,
merge, or lane transition; callers retry the ordinary governed command.

## Sad paths and observable behavioral contracts

| Scenario                                                                                     | Required behavior                                                                                                                                                                                                          | Observable proof                                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| setup callback contains spoofed installation ID                                              | reject until same Admin's ephemeral GitHub user token proves access to that installation/repository and App proof also matches                                                                                             | no binding/persisted token; safe denied audit                                                                     |
| initiating Admin is demoted/revoked during install round trip                                | final binding transaction reauthorizes current live session/membership/policy and fails closed                                                                                                                             | no GitHub Installation Binding or GitHub Repository Binding; pending proof safely denied                          |
| access cleanup response is lost, or refresh revoke returns only `202 Accepted` before expiry | retain quarantined non-exportable cleanup handles; use only documented access/grant `204`, optional access-token `404`, later provider proof, or recorded expiry; never invent refresh introspection or zero locally first | proof is `token_cleanup_unknown`, `refresh_revocation_accepted_unconfirmed`, or `revocation_required`; no binding |
| tenant projection requests App secret-ref identity/version                                   | deny/omit it and expose only the opaque public configuration/rotation version                                                                                                                                              | RLS/DTO/browser seam contains no platform vault ref or secret-ref version                                         |
| second production repository selected                                                        | reject installation confirmation                                                                                                                                                                                           | existing binding unchanged; explicit single-repo error                                                            |
| missing/malformed/invalid webhook signature                                                  | reject before parse/routing/persistence                                                                                                                                                                                    | no inbox/domain/outbox/raw-log row                                                                                |
| authenticated minimal envelope is malformed for its hinted family                            | reject before binding/tenant admission; never guess from free text, owner/name, or a missing singular repository                                                                                                           | no inbox/domain/outbox row; safe rejected metric only                                                             |
| actionless `create`/`delete`/`push`/`status` delivery lacks `action`                         | admit by signed installation/repository IDs and validate the exact actionless full schema                                                                                                                                  | normalized receipt records actionless schema; no invented action                                                  |
| event action presence contradicts its exact schema                                           | reject after HMAC and before durable receipt/domain handling; mark required-schema drift unhealthy                                                                                                                         | no guessed action or partial fact                                                                                 |
| full schema disagrees with admitted minimal envelope/header family                           | reject after binding admission but before persistence/domain handling                                                                                                                                                      | no inbox/domain/outbox row; safe schema-drift evidence                                                            |
| rotated old secret within overlap                                                            | verify inside platform secret policy, persist only opaque public rotation version in tenant receipt, schedule rotation completion                                                                                          | one receipt; no secret value or platform secret-ref version                                                       |
| same delivery ID/same hash                                                                   | return original receipt                                                                                                                                                                                                    | no second fact/command/outbox                                                                                     |
| same delivery ID/different valid-signed hash                                                 | mark ingress unverifiable; open scoped stop                                                                                                                                                                                | safe collision evidence; no content persisted                                                                     |
| durable inbox commit fails                                                                   | return non-2xx so delivery is not falsely acknowledged                                                                                                                                                                     | zero normalized facts/commands                                                                                    |
| delivery is late/out of order                                                                | treat as hint; fetch fresh snapshot and three-way compare                                                                                                                                                                  | no timestamp overwrite or sequence claim                                                                          |
| missed delivery beyond redelivery window                                                     | periodic full reconciliation discovers drift                                                                                                                                                                               | complete epoch and explicit gap refs                                                                              |
| comment is added/deleted/edited while membership pages are traversed                         | invalidate traversal, repeat from the first page, and require two identical complete memberships before absence                                                                                                            | no false deletion; incomplete epoch remains visible                                                               |
| secret in Issue/comment/label/actor content                                                  | persist no raw value; open secret stop and safe notification                                                                                                                                                               | only detector/hash/ref metadata                                                                                   |
| Issue create succeeds but response is lost                                                   | enter `outcome_unknown`; exact match confirms, while zero matches never trigger an automatic second create                                                                                                                 | one create intent; reconciled canonical provider ID or visible unknown                                            |
| delayed Issue appears after repeated complete zero-match scans                               | keep `outcome_unknown` through zero scans; later bind by immutable correlation, with no automatic reissue                                                                                                                  | no duplicate from false absence; delayed provider ID becomes canonical                                            |
| duplicate exact App-created Issues found                                                     | bind earliest stable provider identity; cross-link/close later duplicates                                                                                                                                                  | one GitHub Issue Binding; duplicates retained as history                                                          |
| create marker is dropped/changed by a later body render                                      | reject render/confirmation and open identity conflict; never fall back to mutable event marker                                                                                                                             | original create UUID remains in intent/shadow/binding                                                             |
| create response is lost, then a later body render is observed                                | recover only by immutable create UUID + expected App/installation/request facts; never retry from event marker                                                                                                             | one GitHub Issue Binding despite later contract/event versions                                                    |
| linked-existing Issue is rendered with fabricated create provenance                          | reject render/confirmation; require immutable `origin=link`, `create=none`, and exact link UUID                                                                                                                            | provider history stays truthful; no fake create attribution                                                       |
| origin/create/link correlation changes after binding                                         | open identity conflict and block destructive mirror writes; never convert link to create or vice versa                                                                                                                     | original binding provenance and values remain durable                                                             |
| correlation marker exists under non-App actor                                                | classify actor; do not adopt automatically                                                                                                                                                                                 | external comment or visible collision, never human/App authority                                                  |
| same provider Issue concurrently linked twice                                                | unique binding lock admits one                                                                                                                                                                                             | loser deterministic `github_issue_already_bound`                                                                  |
| comment post outcome unknown                                                                 | reconcile App actor + marker + hash; zero matches remain unknown and never automatically repost                                                                                                                            | one binding if it appears; otherwise visible unknown                                                              |
| delayed comment appears after repeated complete zero-match scans                             | retain the unknown intent, then confirm the late exact marker/hash; do not create a second automatic comment                                                                                                               | one comment binding/worklog record; no false absence                                                              |
| Human Owner reattempt decision races a late exact provider object                            | lock/recheck observations first; candidate-first confirms it, decision-first records one numbered risk-accepted attempt                                                                                                    | one command receipt; later duplicates enter deterministic containment                                             |
| human edits/deletes comment                                                                  | append correction or safe tombstone; no history rewrite                                                                                                                                                                    | original and correction/tombstone addressable                                                                     |
| App marker copied by human, bot, other App, or unknown actor                                 | preserve under exact provider actor class as human/external content or conflict; never confirm echo                                                                                                                        | provider actor ID/kind/classification and mismatch proof                                                          |
| managed block missing/duplicate/malformed/moved                                              | preserve body; open managed-region conflict                                                                                                                                                                                | no destructive rewrite/truncation                                                                                 |
| human edits body inside the final no-CAS write window                                        | never claim lossless preservation; re-read, retain normalized pre-write evidence, and open `potential_body_overwrite` when observable                                                                                      | visible side-by-side recovery; shadow advances only to observed state                                             |
| unmanaged labels change concurrently                                                         | preserve them                                                                                                                                                                                                              | managed delta leaves exact unrelated set                                                                          |
| singleton managed label has multiple values                                                  | open field conflict; no arbitrary winner                                                                                                                                                                                   | current labels visible; workflow unchanged                                                                        |
| label/milestone set echo webhook is permanently lost                                         | converge only from a complete fresh snapshot plus expected outbox state and three-way authority validation                                                                                                                 | shadow may advance without fabricated actor/event                                                                 |
| assignee set has multiple mapped or mixed identities                                         | block start for multiple mapped identities; preserve every unmapped identity and change only mapped deltas                                                                                                                 | deterministic conflict or exact 0/1 mapping; no inferred Human Owner                                              |
| Opzava Execution Assignee is an AI agent/non-projectable identity                            | treat zero mapped provider assignees as converged; keep Opzava assignment and preserve unmapped collaborators                                                                                                              | no fabricated GitHub user, false conflict, or unassignment                                                        |
| label/assignee mutation returns 2xx but is dropped                                           | re-read fails confirmation; classify permission/drift                                                                                                                                                                      | shadow does not advance                                                                                           |
| conflict resolution uses stale base/domain/provider/conflict version                         | reject with current conflict/version and refresh evidence; perform no owner command or outbox write                                                                                                                        | zero shadow/domain/outbox change                                                                                  |
| two Human Owners resolve one conflict version differently                                    | one canonical command receipt wins under locks; loser receives current conflict/version                                                                                                                                    | one decision and at most one bound mirror intent                                                                  |
| accepted conflict choice needs a separate Revision/approval decision                         | link exact decision, remain blocking in `decision_required`, and emit no mirror write                                                                                                                                      | no false resolution, shadow advance, or approval                                                                  |
| provider drifts while resolution mirror is pending                                           | retain/supersede pending evidence and refresh conflict; never finalize stale shadow                                                                                                                                        | selected and new provider values remain visible                                                                   |
| GitHub closes Issue before Review/merge                                                      | record fact/request; reject Done and open conflict                                                                                                                                                                         | lane unchanged; external state visible                                                                            |
| installation suspended/repository removed                                                    | stop token mint/dispatch, keep last-confirmed reads, open health stop                                                                                                                                                      | scoped health + containment refs                                                                                  |
| disconnect request/response is replayed                                                      | same key/hash returns one saga; mismatch rejects; fenced generation admits no new mint/outbox claims                                                                                                                       | one GitHub Disconnect Saga and one provider-action lineage                                                        |
| provider uninstall/revoke response is lost                                                   | enter `provider_outcome_unknown`, reconcile exact provider identity, and never infer success from local deletion or blindly retry                                                                                          | outbound remains fenced; history/cleanup handle retained                                                          |
| provider action requires account-owner intervention                                          | enter `revocation_required`, show secure in-product action/status, and disable reconnect until provider confirmation and local cleanup                                                                                     | no false Disconnected state; no second live binding generation                                                    |
| token expires                                                                                | discard/mint new token under same claim generation                                                                                                                                                                         | no persisted/reused expired token                                                                                 |
| `401`/permission `403`/rate `403` or `429`                                                   | distinct auth/permission/rate classification                                                                                                                                                                               | correct health dimension/backoff, no retry storm                                                                  |
| provider `404`                                                                               | prove repository capability before declaring deletion                                                                                                                                                                      | no false deletion during permission loss                                                                          |
| provider `410`                                                                               | mark Issues capability unavailable/unhealthy                                                                                                                                                                               | affected gate/stop only                                                                                           |
| provider `422`                                                                               | terminal request/schema/policy conflict unless provider says retryable                                                                                                                                                     | safe error and no blind retry                                                                                     |
| force-push/head/base drift                                                                   | append fact, invalidate SHA evidence, cancel stale merge/remediation                                                                                                                                                       | new head binding; old evidence retained/stale                                                                     |
| mergeability is unknown                                                                      | refresh; do not launch remediation or infer clean/conflict                                                                                                                                                                 | explicit inconclusive projection                                                                                  |
| external/early merge                                                                         | retain Review/WIP, open conflict, require Post-Merge Review                                                                                                                                                                | native merge fact plus no ordinary Done                                                                           |
| Actions changes status label without OIDC request                                            | treat label as projection/request hint only; reject command authority                                                                                                                                                      | no command receipt, direct transition, or approval                                                                |
| OIDC Actions requests generic command or deployment/rollback/release mutation                | reject outside exhaustive `wf230` source policy; adapter/config cannot widen authority                                                                                                                                     | no Actions Request Receipt/downstream result and no provider/domain mutation                                      |
| OIDC Actions reports an uncorroborated deployment fact                                       | reject absent a fresh independently fetched App/provider or exact #236-owned Provider Observation bound to deployment/status ID, repository, run, ref/SHA, and environment                                                 | no Actions Request Receipt or Provider Observation                                                                |
| Two Actions requests race one OIDC `jti` or nonce                                            | one atomic receipt/hash reservation wins; mismatch loses deterministically                                                                                                                                                 | one Actions Request Receipt plus designated downstream result; zero partial rows                                  |
| OIDC Actions request is replayed or claim/SHA drifts                                         | same-hash authorized replay or reject before new receipt; drift requires a fresh exact request                                                                                                                             | one `jti`/nonce semantic result; no stale transition or approval                                                  |
| authorized ref push response is lost and ref equals intended new SHA                         | reconcile and confirm the existing Authorized Git Ref Update; never launch a second remediation                                                                                                                            | one update/attempt/run with provider confirmation                                                                 |
| authorized ref push response is lost and ref remains old SHA                                 | keep bounded unresolved with scheduled observations and escalation; old SHA is not absence proof and never triggers blind repush                                                                                           | one fenced unknown update; no duplicate run or push                                                               |
| authorized ref push response is lost and ref is a third SHA                                  | record `ref_conflict`, cancel stale authority, and require fresh exact provider facts/authorization                                                                                                                        | old/intended/actual SHAs retained; no stale confirmation                                                          |
| health probe recovers but reconcile is partial                                               | keep stop/unverifiable                                                                                                                                                                                                     | no stop resolution until complete epoch                                                                           |
| stale outbox/reconcile worker finalizes after reclaim                                        | claim token/generation rejects finalizer                                                                                                                                                                                   | winning worker state preserved                                                                                    |

## Real-seam validation matrix

### HTTP + Postgres contract seam

Run the real webhook HTTP route and real Postgres transaction/RLS/worker code in local Docker. Use
deterministic raw fixtures signed with test secret versions—not mocked verification—and prove:

- setup transactions fail closed with safe evidence when expiring GitHub App user tokens are
  disabled or unverifiable; with expiration enabled, lost/unknown user and refresh credential
  revocation retains only quarantined non-exportable cleanup handles and permits no local zeroing,
  GitHub Installation Binding, or GitHub Repository Binding. Prove documented access/grant `204`,
  optional access-token `404`, and provider-issued expiries; treat refresh `202 Accepted` as
  unconfirmed and retain its handle until recorded expiry absent later documented proof.
  Same/different-hash replay, concurrent cleanup, and stale finalizers cannot zero early or create a
  second binding;
- exact raw-byte mutation, Unicode, missing/wrong/rotated signature, size/content type, unsupported
  event, unknown action on action-bearing events, valid actionless
  `create`/`delete`/`push`/`status`, missing or unexpected action against the selected schema,
  action-bearing repository/installation/repository-set minimal-envelope families, missing/extra
  repository identities, minimal/full-schema disagreement, cross-install/repository, secret-bearing
  content, durable commit-before-ack;
- duplicate/redelivered delivery, delivery/hash collision, out-of-order/gap, restart and stale
  claim;
- command/outbox atomicity, tenant RLS denial, claim-token fencing, dead-letter/replay
  authorization;
- `AcceptProposal(create)` same-key/same-hash replay, same-key/different-hash collision, and
  different-key concurrent attempts/worker races, proving one Backlog DevTicket, one stable pending
  create-intent binding with no provider Issue identity, one outbox lineage, and later exact
  provider confirmation attaching the unique Issue key without recreating either;
- `AcceptProposal(link_verified_existing)` with fresh/stale provider observations and concurrent
  ownership, proving the exact repository/Issue key is uniquely reserved before acceptance, only
  managed mirror publication may remain pending, drift rejects with zero partial Proposal/DevTicket/
  GitHub Issue Binding/Mirror Outbox Intent, and replay creates no second intent;
- `MergeProposal` with and without governed-work changes plus same-key/same-hash replay,
  same-key/different-hash collision, and different-key concurrency, proving it appends planning
  evidence and at most opens one proposed Revision while creating no DevTicket, GitHub Issue
  Binding, Mirror Outbox Intent, provider mutation, or GitHub Issue;
- tenant API/DTO/RLS assertions across Installation Association Proof, GitHub Installation Binding,
  GitHub Repository Binding, and Webhook Inbox Receipt proving each exposes only the opaque public
  App configuration key/rotation version and never carries a platform App Registration Ref/ID, vault
  ref, secret-ref identity, or secret-ref version;
- concurrent OIDC `(issuer,jti)`/nonce reuse with same and different request hashes, proving the
  Actions Request Receipt and its family-specific downstream result commit atomically or not at all:
  corroborated native check/deployment facts append one Provider Observation and no command receipt;
  `ready.validate` commits one DevTicket command receipt; an eligible failed policy gate commits its
  owning-domain Needs Human Approval Request/command receipt. Missing/stale/mismatched deployment
  ID/status/environment/repository/run/ref/SHA evidence, generic governed commands, and deployment/
  rollback/release mutations create zero receipts/effects;
- concurrent/replayed `DisconnectGitHub` same/different-hash and different-idempotency-key requests,
  pre-existing unclaimed intents and outbound claims racing the fence, provider-response loss,
  `revocation_required`, stale finalizers, and reconnect attempts, proving the binding-generation
  uniqueness constraint admits one GitHub Disconnect Saga/provider-action lineage, each unsent
  intent is provably `cancelled_before_send`, no ordinary post-fence token mint/outbox claim occurs,
  possibly sent effects remain drained/unknown, no local-cleanup success occurs before provider
  revocation/expiry confirmation, and no second binding generation exists while unresolved;
- repeated Authorized Git Ref Update delivery/finalization around a lost push response, proving
  intended-new-SHA confirmation, bounded unresolved old-SHA state, third-SHA conflict, and exactly
  one remediation run/update record with no blind repush;
- concurrent `ResolveSyncConflict` same/different-hash replay, two-owner decisions, stale provider/
  domain/conflict versions, decision-required owner commands, pending-mirror drift, and stale outbox
  finalization, proving one decision/intent and no premature shadow advance;
- concurrent `ResolveUnknownMirrorEffect` same/different-hash replay, stale observation/health/
  binding versions, consumed approvals, and late provider appearance racing a numbered reattempt,
  proving one decision/attempt and deterministic correlation-based duplicate containment;
- three-way same-field conflict, different-field merge, complete snapshot epoch, complete retained
  comment-ID membership and deletion, concurrent comment add/delete/edit during pagination with
  restart and two identical complete traversals, exact set-field convergence after a permanently
  missed webhook, deterministic zero/one/multiple/mixed mapped assignees, and convergence.

### Real provider scratch seam

Use one fixed scratch repository installed on the real test GitHub App. It is infrastructure, not a
second production repository. Drive real API mutations and actual signed deliveries for:

- install/setup state, spoofed callback denial, GitHub user-to-installation association mismatch,
  missing/wrong/retired client-secret exchange, Admin demotion/session revocation before final
  binding, suspension/unsuspension, repository add/remove, permission drift, private-key/
  client-secret/webhook-secret rotation, disabled/unverifiable mandatory expiring-user-token
  configuration, access/grant delete `204`, optional access-token check `404`, provider-issued
  access/refresh expiries, refresh revoke `202 Accepted` as unconfirmed, and lost cleanup response;
  prove no invented refresh introspection and local zeroing/binding only after the exact applicable
  documented evidence or deterministic recorded expiry;
- disconnect through the secure local-Docker UI with the real scratch App: inject provider response
  loss, prove the Card/Admin health surface shows `disconnecting`, `provider_outcome_unknown`, or
  `revocation_required` with an in-product action; refresh/retry the browser and prove the same
  saga, no outbound capability, provider-confirmed uninstall/revocation before local cleanup,
  reconnect disabled while unresolved, then a new binding generation only after terminal disconnect;
- Issue create/link, response-loss recovery, duplicate containment, body/label/milestone/state,
  comment/worklog/correction/deletion, App echo and copied marker;
- drive Proposal decisions against the real scratch provider: create acceptance commits one pending
  stable create identity before any provider Issue exists and later attaches the observed Issue;
  verified-link acceptance first observes and reserves the exact existing Issue key while only its
  managed publication remains pending; stale observation or two concurrent link owners yield no
  partial loser; MergeProposal produces no provider request or new GitHub object in either its
  planning-only or proposed-Revision branch;
- fault-inject delayed Issue/comment visibility beyond repeated complete zero-match scans; prove
  zero matches never authorize automatic reissue, then reveal the original exact marker and bind it
  once; separately prove an explicitly approved numbered reattempt records its duplicate-risk
  decision and deterministically contains a later duplicate;
- lose the create response, then render a later contract/body event before recovery; prove the
  immutable `create` UUID survives every renderer/parser/shadow/binding and yields one Issue while a
  changed/dropped marker cannot fall back to mutable `event` identity;
- link a pre-existing Issue and prove every renderer/parser/shadow/binding retains `origin=link`,
  `create=none`, and one immutable link UUID without fabricating App-create history or allowing a
  later event to change origin;
- classify copied markers from a mapped human, the expected Opzava App, a third-party App/bot, and
  an unknown/deleted actor; prove only the mapped human becomes a Human Comment, only the fully
  correlated expected App confirms an outbox record, and all external classes retain zero workflow
  authority;
- force a human body edit inside the final read/write race and prove the UI never promises lossless
  preservation, retains the normalized protected observation, and exposes any detectable
  `potential_body_overwrite` conflict for recovery;
- suppress a label/milestone echo delivery and prove complete-snapshot convergence without an
  invented actor/event; exercise zero, one, multiple, and mixed mapped/unmapped assignee sets;
- pagination, rate/`Retry-After`, `401/403/404/410/422/5xx`, rename/archive/delete recovery;
- PR binding, force-push/base/head drift, checks/statuses/Actions facts, mergeability
  unknown/conflict, governed merge confirmation, early/external merge, and OIDC request issuer/
  audience/JWKS/`jti`/repository/workflow/run/attempt/ref/SHA binding and replay rejection; prove
  native check/deployment facts bind independently fetched App/provider or exact #236-owned Provider
  Observations by deployment/status identity, repository, run, ref/SHA, and environment; prove each
  family writes only its designated downstream record, and reject uncorroborated facts, generic
  governed commands, and deployment/rollback/release mutations;
- fault-inject a lost Authorized Git Ref Update response and separately observe intended new SHA,
  unchanged old SHA, and a third-party third SHA; prove confirmation, bounded unresolved escalation,
  and visible ref conflict respectively, with one remediation run and no automatic second push;
- prove a Runner cannot obtain a raw write-capable installation token or push a ref outside the
  broker-authorized exact old/new SHA update, even when it controls its local credential helpers.

Do not fake a provider `2xx` and call it real behavior. Provider tests use uniquely prefixed
records, clean them through governed test teardown, and retain safe provider IDs/results as
evidence.

### Authenticated user-level seam

Against `http://web.opzava.localhost:18088`, with ordinary login, real tenant data, real local
Docker, and the fixed provider seam, prove an Admin can:

1. install and verify the GitHub App without entering a token;
2. accept a Proposal through `create`, see one Backlog DevTicket and stable pending create identity
   before a provider Issue exists, then see later provider confirmation attach exactly one Issue;
3. accept through `link_verified_existing`, see the freshly observed existing Issue identity claimed
   before acceptance while managed publication remains pending, and see stale/concurrent ownership
   fail without a partial second DevTicket, GitHub Issue Binding, or Mirror Outbox Intent;
4. merge a Proposal with and without governed-work changes and see planning evidence plus at most
   one proposed Revision, with no new DevTicket, GitHub Issue Binding, Mirror Outbox Intent,
   provider mutation, or GitHub Issue;
5. edit shared context in GitHub and see deterministic Opzava convergence;
6. see a managed-contract edit become a Revision, not an overwrite;
7. observe comments/worklogs with truthful human/App/bot/unknown attribution and PR/check/review/
   merge facts without opening GitHub;
8. see the whole-body no-CAS limitation, inspect side-by-side protected/current values after a
   detectable overwrite race, and submit a governed recovery without a false lossless claim;
9. see multiple mapped GitHub assignees block start while unmapped collaborators remain preserved;
10. see an ambiguous Issue/comment effect remain visibly unknown across zero-match scans, then use
    the Human Owner form to keep waiting, abandon publication, or explicitly approve one numbered
    duplicate-risk reattempt without any automatic absence inference;
11. resolve a same-field Sync Conflict in Opzava, see stale competing decisions rejected, and see
    `resolution_pending_mirror` become resolved only after confirmed mirror-back;
12. see truthful degraded/unhealthy/unverifiable health and scoped gate reasons;
13. see Actions append a corroborated native check/deployment Provider Observation, request
    field-code-only `ready.validate`, or request a Needs Human Approval Request for an eligible
    failed policy gate, with each family showing only its designated receipt; see uncorroborated
    deployment facts, generic governed commands, and deployment/rollback/release mutations reject
    with no receipt;
14. see external merge require Post-Merge Review and no false Done;
15. inspect all evidence in Card/Development/health views in light/dark, keyboard, and narrow
    viewport;
16. disconnect in secure Opzava UI, refresh/retry through lost provider response, complete any
    `revocation_required` step in place, and see reconnect remain disabled until provider-confirmed
    revocation/expiry plus local cleanup terminalize the one saga;
17. see setup fail closed with safe actionable status when the expiring-user-token setting is
    disabled or unverifiable; after it is enabled, inspect the setup proof during lost user/refresh-
    token revocation and confirm quarantined cleanup-handle retention with no binding/local zeroing,
    distinguish access/grant `204` and optional access-token `404` from refresh `202 Accepted`, and
    see the refresh handle remain until recorded expiry absent later documented proof. Then confirm
    tenant UI/API/DB output contains only the opaque public App configuration key/rotation version
    and no platform App Registration Ref/ID, vault ref, secret-ref identity/version; and
18. inspect an ambiguous Authorized Git Ref Update under intended-new, old, and third-SHA provider
    observations and see confirmation, bounded unresolved escalation, or conflict without a second
    remediation run.

No model token is a synchronization, state-machine, or assertion oracle.

## Migration and cutover

1. Add the deep `DevBoard.GitHubIntegration` module's tables/ports/workers through expand-contract
   while legacy reads remain live. No target write calls GitHub from a DevTicket transaction.
2. Register/install the App and confirm one immutable GitHub Repository Binding. Complete first full
   reconciliation before enabling target writes.
3. Backfill every `issue_projection` with immutable provider repository/Issue IDs and initial Mirror
   Shadows. Classify missing, renamed, deleted, and conflicting provider resources explicitly.
4. Migrate every `issue_create_intent`, including processing/failed rows. Reconcile provider orphans
   and unknown outcomes; never discard sticky failures.
5. Drain or migrate every pending/processing/failed/**dead** `issue_close_outbox` row with attempts,
   dedupe key, claim, error, and target. Do not infer Done from a successful close.
6. Backfill comments/worklogs/evidence with original actor/source/time/provider refs and Secret-Safe
   validation. Preserve legacy gate labels and do not fabricate transitions.
7. Run bounded dual-read comparisons for counts, identities, bodies, managed/unmanaged labels,
   comments, state, provider facts, health, and history. There is one target write authority; no
   indefinite dual-write.
8. Cut Connect GitHub to the App, cut workers to the new inbox/outbox/reconciler, and stop new
   legacy create/close intents. Verify all legacy queues terminally classified.
9. Disable active OAuth/PAT credential use and remove `GITHUB_TOKEN`, `GITHUB_OAUTH_CLIENT_ID`, the
   OAuth device-flow service/UI, manual close worker, and legacy write paths. Revoke provider
   credentials where possible. Where secure human provider action remains, record
   `revocation_required` and retain only the quarantined, non-exportable cleanup handle; destroy and
   zero the final local credential handle/ref only after the exact applicable documented `204`,
   optional access-token `404`, later documented provider proof, or deterministic recorded
   provider-issued expiry. Refresh revoke `202 Accepted` remains unconfirmed.
10. Redirect `/issues` only after authenticated browser parity and rollback evidence. Rollback may
    restore legacy **read** surfaces during the bounded window; it never restores two write owners.

Every source row ends migrated, merged, frozen historical, archived, or quarantined with reason and
owner. “Skipped” is a cutover blocker.

## Rejected alternatives

| Alternative                                                         | Rejected because                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Keep PAT/OAuth for humans and App for workers                       | creates two credential/actor/health authorities and cannot prove which path wrote provider state             |
| Treat current Connections `/user` probe as health                   | proves neither repository access nor required permissions, webhooks, rate, queue, or reconciliation          |
| Let webhook handlers update DevTickets                              | creates a second policy engine and bypasses `wf230` command/receipt/authorization rules                      |
| Persist raw webhooks for replay                                     | violates secret-safe storage and is unnecessary when normalized facts plus provider snapshots are available  |
| Sort deliveries by timestamp or delivery ID                         | GitHub provides no global/monotonic delivery order; timestamps are observations                              |
| Rely on outbox key for exactly-once provider mutation               | GitHub may commit while the response is lost; a local key cannot deduplicate provider side effects           |
| Blindly retry unknown create/comment                                | can produce duplicate Issues/history; reconcile first                                                        |
| Trust hidden marker alone                                           | any GitHub writer can copy it; require authenticated App actor/installation and expected intent/hash         |
| Blindly/unconditionally replace the whole body or label set         | destroys human/unmanaged data and races concurrent edits; compensated serialized body writes remain required |
| Treat GitHub close, green CI, or repository approval as Done/Review | contradicts Opzava-owned gates and #229 independent Review                                                   |
| Auto-revert an external merge                                       | rewrites native history without authority; preserve fact and require Post-Merge Review                       |
| Give conflict agent general GitHub write/merge authority            | violates Runner fencing, least privilege, and independent Review                                             |
| Use model inference for sync/conflict correctness                   | makes deterministic application state expensive and unverifiable                                             |

## Downstream implementation constraints for #237

The final tracer-bullet graph must preserve vertical, real seams:

1. App bootstrap + immutable GitHub Installation Binding and GitHub Repository Binding + dimensional
   health and secure callback proof.
2. Verified webhook HTTP inbox + Secret-Safe normalized receipt + Postgres RLS/dedupe.
3. One accepted DevTicket create/link Mirror Outbox Intent through provider confirmation,
   unknown-outcome recovery, unique GitHub Issue Binding, and the exact `ResolveUnknownMirrorEffect`
   no-auto-reissue and Human-Owner-resolution lifecycle.
4. Canonical managed body/labels + comment/worklog identity + three-way Mirror Shadows and exact
   versioned/idempotent `ResolveSyncConflict` lifecycle through provider confirmation.
5. Provider-fact projection and exact PR/base/head/SHA/check/review correlation.
6. OIDC-authenticated Actions request translation and Needs Human Approval Request without bypass.
7. #229-governed merge + external-merge/Post-Merge Review behavior.
8. #232-governed merge-conflict remediation with fresh Review.
9. Complete reconciliation/health recovery and legacy OAuth/PAT/outbox cutover.
10. Durable `DisconnectGitHub` saga from secure-UI command through outbound fencing, provider
    revocation/uninstall/expiry confirmation, local cleanup, `revocation_required`, and
    new-generation reconnect.
11. Authorized Git Ref Update response-loss reconciliation across intended-new, unchanged-old, and
    third-SHA observations with one remediation run and no blind push retry.

In addition to the complete PRD-019 Ready contract, each ticket must state a clear outcome and
bounded scope; dependency state and blocking edges; sad paths and edge cases; exact command/receipt/
event identities; human-input state and every required human answer; named SecretRefs or explicit
`none`; Human Owner; structured type/priority/risk/severity/area classification; approval gates and
the exact Ready Approval version/hash; the final behavioral contract at HTTP/DB/provider/browser
seams; objective final acceptance criteria; explicit pass/fail user-level validation gates and
end-to-end evidence expectations; migration/rollback; and every provider resource it may create or
clean up. Missing any PRD-019 Ready field or WF-231-specific field keeps the ticket out of Todo.

## Prepared resolution

#231 may be resolved only after the parent map verifies this App/Installation/Repository identity
split; safe webhook ingress order; no-blind-retry ambiguous-mutation contract; canonical managed
Issue representation; field-level authority and three-way Mirror Shadow algorithm; provider-fact
correlation; Actions request limits; #229/#232 remediation seams; dimensional scoped health/Absolute
Stop recovery; real-seam matrix; and legacy credential/outbox cutover. Only then may the map and
migration manifest designate this memo current input for #237 without reopening it.
