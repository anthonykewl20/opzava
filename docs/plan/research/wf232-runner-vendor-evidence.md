# WF-232 vendor evidence appendix: local harness and coordination constraints

> **Status:** Supporting vendor-evidence appendix for the resolved
> [WF-232 Runner protocol](wf232-runner-control-protocol.md). This appendix is neither an ADR nor an
> implementation brief; the resolved protocol memo wins if an inference here conflicts with it.
>
> **Evidence captured:** 2026-07-17 (Asia/Manila).
>
> **Freshness boundary:** Public product behavior below was checked against first-party vendor
> documentation on the capture date. OpenClaw behavior is checked against the Opzava-owned pinned
> fork at `v2026.6.11`, commit `bd2740fedc`, rather than an unpinned upstream head. Volatile or
> experimental surfaces require a version-bound capability probe before implementation.

## Question

What first-party product facts constrain the protocol by which Opzava enrolls a local machine,
selects a local or cloud Runner, launches and controls Codex or Claude Code in an isolated
branch/worktree, captures ordered execution evidence, pauses safely on disconnect, coordinates
through Ask Admin and Slack, and grants exact named-secret access without putting secret values in a
DevTicket, activity history, worklog, or GitHub mirror?

This memo deliberately separates three kinds of statement:

- **Vendor fact** means the cited provider or pinned source documents the behavior.
- **Opzava inference** means a proposed constraint derived from those facts. It is not a provider
  promise and becomes authoritative only if the active Wayfinder synthesis adopts it.
- **Evidence gap** means the available primary sources do not establish enough behavior to lock a
  protocol.

The current Opzava domain boundary remains the one in [PRD-019](../../prd/PRD-019-dev-board.md),
[ADR-017](../../adr/ADR-017-dev-board-authority-sync-execution.md), and the current
[DevTicket command model](wf230-devticket-command-model.md): a Runner is an execution location and
control endpoint. It is not the human/agent actor, model, harness session, GitHub App, Slack user,
OpenClaw Device, or OpenClaw Node.

## Executive findings

1. **Neither Codex nor Claude Code supplies the Dev Board's authority protocol.** Both expose useful
   local execution, session, permission, hook, and worktree surfaces, but their events are
   harness-local observations. The reviewed docs do not document cryptographically signed,
   DevTicket/version/fence-bound receipts. Opzava therefore needs a local Runner controller that
   authenticates the machine, enforces already-authorized launch orders without granting workflow
   admission, and wraps normalized observations in its own ordered receipts.
2. **A child-process adapter is the narrowest stable common denominator.** `codex exec` is a stable
   non-interactive Codex command with JSONL and resume support; `claude -p` is Claude Code's
   non-interactive/Agent-SDK CLI with JSON or streaming JSON, explicit tool policy, and resume
   controls. Codex app-server and Codex remote control are documented as experimental. Claude Remote
   Control is a vendor-hosted research-preview path, not a third-party control protocol.
3. **The Runner must own Git worktree identity.** Both products can create worktrees, but their
   base, cleanup, ignored-file copy, approval persistence, and detached/branch behavior differ. A
   provider-neutral lease cannot be proven from a vendor-managed worktree name. Opzava should create
   and verify the exact branch/worktree before launching the selected harness in that `cwd`.
4. **Vendor permissions must not be mistaken for Opzava approvals.** Codex sandbox and approval
   policy, Claude permission modes/rules, and OpenClaw exec approvals control tool execution on a
   host. They do not approve a Ready Contract Version, grant a DevTicket lease, authorize a merge,
   or identify a human decision. They can only make an already-admitted run narrower.
5. **Hooks are useful telemetry and local enforcement, not the sole evidence channel.** Claude hooks
   can block selected pre-action events and report lifecycle events; Codex has trusted-project hooks
   and machine-readable `exec` events. Hook output is not documented as signed, post-action hooks
   cannot undo effects, and some delivery failures are explicitly non-blocking. The Runner needs an
   independent process supervisor plus Git/filesystem/process reconciliation.
6. **No automatic local-to-cloud failover is supported by the trust evidence.** Native local remote
   features stop or reconnect around machine/network availability, while cloud tasks use different
   filesystems, credentials, and execution identities. The safe inference is to fence the lost local
   lease, preserve its worktree, emit a checkpoint/summary, notify Slack, and require an explicit
   new claim rather than silently continuing in cloud.
7. **GitHub and Slack are retrying external transports.** GitHub identifies deliveries and supports
   redelivery; Slack retries Events API deliveries and requires fast acknowledgement. Both need
   verify-before-queue and durable idempotency. Neither webhook payload is permission to mutate a
   DevTicket without current Opzava authorization and expected versions.
8. **The local Docker Review stack must remain local authority.** Docker health checks and Compose
   status are useful observations, but a published port defaults to all interfaces if no host IP is
   set, and Docker daemon control is effectively host-root authority. Opzava must not expose the raw
   daemon or infer behavioral correctness from container health. A separate authenticated preview
   tunnel remains an evidence gap.
9. **Pinned OpenClaw supplies reusable runtime primitives, not domain identity.** Its Nodes,
   Devices, ACP sessions, native Codex harness, exec approvals, SecretRefs, and health endpoints are
   valuable adapter/runtime inputs. Its own docs explicitly separate Node pairing, device roles,
   local exec approval, harness ownership, and OpenClaw session state. Those records cannot
   substitute for an Opzava Runner enrollment, Execution Lease, Ready Approval, or DevTicket ledger.

## Source and maturity register

| Area        | Primary source used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Source/maturity note                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex       | OpenAI's current [Codex command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli), [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security), [MCP](https://learn.chatgpt.com/docs/extend/mcp), [worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees), [advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced), and [scheduled tasks](https://learn.chatgpt.com/docs/automations)                                                                                                                                                                                                                                                                          | The OpenAI manual fetch helper reported its cache current on 2026-07-17. Individual command maturity labels still matter.                                      |
| Claude Code | Anthropic's current [CLI reference](https://code.claude.com/docs/en/cli-usage), [programmatic mode](https://code.claude.com/docs/en/headless), [permissions](https://code.claude.com/docs/en/permissions), [hooks](https://code.claude.com/docs/en/hooks), [worktrees](https://code.claude.com/docs/en/worktrees), [checkpointing](https://code.claude.com/docs/en/checkpointing), and [Remote Control](https://code.claude.com/docs/en/remote-control)                                                                                                                                                                                                                                                                                                                                                                               | Remote Control is explicitly a research preview. Version-qualified behavior in the docs must be part of admission probes.                                      |
| GitHub      | GitHub's [webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks), [redelivery](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks), [GitHub App auth](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app), [installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), and [ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) | GitHub is provider truth for its native issue/PR/check/merge facts, not DevTicket workflow truth.                                                              |
| Git         | The upstream [git-worktree reference](https://git-scm.com/docs/git-worktree.html)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Git is the source for shared repository metadata and linked-worktree behavior.                                                                                 |
| Slack       | Slack's [request verification](https://api.slack.com/authentication/verifying-requests-from-slack), [Events API](https://api.slack.com/apis/connections/events-api), [interactivity handling](https://api.slack.com/interactivity/handling), and [Socket Mode](https://api.slack.com/apis/connections/socket)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Slack is a signed transport and human conversation surface, not the source of Opzava role or workflow authority.                                               |
| Docker      | Docker's [Compose service reference](https://docs.docker.com/reference/compose-file/services/), [startup/health ordering](https://docs.docker.com/compose/how-tos/startup-order/), [Engine security](https://docs.docker.com/engine/security/), and [daemon-socket protection](https://docs.docker.com/engine/security/protect-access/)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Container liveness and Engine access are different trust surfaces.                                                                                             |
| OpenClaw    | Opzava's [pinned upstream record](../../../mainframe/UPSTREAM.md) and vendored first-party docs for [Nodes](../../openclaw/nodes/index.md), [Gateway pairing](../../openclaw/gateway/pairing.md), [exec approvals](../../openclaw/tools/exec-approvals.md), [ACP agents](../../openclaw/tools/acp-agents.md), [agent harnesses](../../openclaw/plugins/sdk-agent-harness.md), [SecretRefs](../../openclaw/gateway/secrets.md), and [health](../../openclaw/gateway/health.md)                                                                                                                                                                                                                                                                                                                                                         | These facts are pinned to `v2026.6.11` / `bd2740fedc`, imported 2026-07-04. A later upstream release is not evidence until deliberately imported and verified. |

## 1. Codex CLI and ChatGPT desktop app

### 1.1 Documented execution surfaces

**Vendor facts**

- The command reference marks `codex exec` **stable** and documents it as non-interactive, with
  stdout/JSONL streaming and session resume. `codex app-server` and `codex remote-control` are
  **experimental**; `codex mcp-server` is stable. The same reference documents the ChatGPT desktop
  app launcher only for macOS and Windows, while Codex sandbox support covers macOS, Linux, and
  Windows ([command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli)).
- `codex exec` runs read-only by default. Automation can explicitly select `workspace-write` or
  `danger-full-access`; OpenAI recommends the least permissions required. `--json` emits JSONL
  events including thread/turn lifecycle, commands, file changes, MCP calls, web searches, and plan
  updates. `--output-schema` constrains the final response, `--ephemeral` avoids persisting rollout
  files, and `codex exec resume` continues a saved run
  ([non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)).
- Codex treats sandbox mode and approval policy as separate controls. Local defaults restrict writes
  to the workspace and disable command network access. App/MCP calls may also request approval, and
  destructive annotated calls require approval. `danger-full-access` removes the sandbox boundary;
  it is not merely a more convenient write mode
  ([approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)).
- Codex project `.codex/config.toml`, project hooks, and project rules load only for a trusted
  project. User and system layers remain independent. Local state under `CODEX_HOME` can include
  config, auth, history, sessions, logs, and caches; OpenAI explicitly says an `auth.json` used for
  automation must be treated like a password
  ([advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced),
  [non-interactive authentication](https://learn.chatgpt.com/docs/non-interactive-mode#authenticate-in-automation)).
- Codex supports local STDIO and remote Streamable HTTP MCP servers. The desktop app, CLI, and IDE
  extension on the same host share Codex MCP configuration. If an enabled MCP server is configured
  as required and fails to initialize, `codex exec` exits instead of continuing without it
  ([MCP](https://learn.chatgpt.com/docs/extend/mcp),
  [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)).

**Opzava inferences**

- The v1 Linux-compatible adapter should target `codex exec`, not require the desktop app. Desktop
  presence may be an enrolled capability, but it cannot be a universal prerequisite.
- The adapter should consume JSONL as a provider observation stream but mint its own receipt
  envelope containing Runner ID, machine enrollment ID, adapter/version, DevTicket ID, Ready
  Contract Version, lease ID, fence token, attempt ID, monotonic sequence, event time, and payload
  digest.
- Admission should pass explicit sandbox/approval/network settings for the run and record their
  effective values. Ambient user configuration must never silently widen an Opzava policy. Project
  config and hooks may narrow the run, but any mismatch between requested and observed capabilities
  should fail the launch.
- Codex authentication stays host-local. Opzava may record `authenticated | expired | unavailable`,
  account/provider class, probe time, and safe error class, but never read, upload, or mirror
  `auth.json`, keychain material, access tokens, or API keys.
- Required MCP inventory should be compared by canonical server/tool identity and effective policy,
  not merely by server name. A missing required server should be a deterministic admission failure,
  not a best-effort warning.

### 1.2 App-server and remote control are not a stable v1 control seam

**Vendor facts**

- The command reference labels `codex app-server` experimental. It can listen on stdio, WebSocket,
  or a Unix socket. WebSocket authentication can use a capability token or a signed bearer token,
  but authentication is disabled if no mode is configured; non-local listeners warn. The docs say
  app-server is primarily for development/debugging and may change without notice
  ([command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-app-server)).
- `codex remote-control` is also experimental. It starts/manages a local app-server daemon and can
  mint a short-lived pairing code. OpenAI explicitly distinguishes this from app-server when
  building a local protocol client
  ([command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-remote-control)).

**Opzava inference**

Do not make either experimental surface the only v1 Runner adapter. A future version-gated Codex
app-server adapter may improve steering and structured lifecycle control, but `codex exec` plus an
Opzava-owned supervisor is the stable baseline. Any future app-server listener should prefer stdio
or a local Unix socket; a network listener needs explicit authenticated transport and must never be
silently exposed.

### 1.3 Worktrees and unattended local scheduling

**Vendor facts**

- Codex-managed desktop worktrees start from the selected branch's `HEAD`, normally use detached
  `HEAD`, live under `CODEX_HOME/worktrees` by default, and remain associated with a task.
  Gitignored files are not copied unless a `.worktreeinclude` pattern opts them in. The docs use
  `.env` and secret config as examples, which demonstrates capability rather than a recommendation
  to copy secrets ([worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)).
- Scheduled local tasks can run in the project directory or an isolated worktree, but the computer
  must remain on, the desktop app must remain running, and the project must remain available. Web
  scheduled tasks cannot directly work in a folder on the user's computer. Scheduled tasks run with
  the user's default sandbox settings
  ([scheduled tasks](https://learn.chatgpt.com/docs/automations)).

**Opzava inferences**

- The Runner should create a named branch and linked worktree itself and then launch Codex in that
  exact directory. Do not use a hidden Codex worktree as the durable identity of an Execution Lease.
- Never automatically copy `.env`, credential files, or secret configs into every worktree. Named
  secret grants should resolve just in time to the narrow process/command that needs them.
- A powered-off or disconnected local machine is a normal loss-of-authority event. Scheduled-task
  behavior supports pausing and notifying; it does not support invisible cloud continuation.

### 1.4 Codex evidence gaps

- The public docs show JSONL event examples but do not publish a compatibility guarantee for every
  event field across CLI releases. The adapter needs a supported-version matrix and contract tests.
- The reviewed docs do not establish signed JSONL events, a monotonic vendor receipt sequence, or a
  DevTicket/fence binding. Opzava must provide those properties outside Codex.
- Remote-control and app-server maturity, authentication, and protocol shape can change. They
  require version-pinned conformance tests before becoming an adapter beyond the stable
  child-process path.
- The docs do not establish that a consumer ChatGPT login may be delegated to an unrelated remote
  service for perpetual unattended execution. Product/terms review is still required before Opzava
  automates subscription-backed Codex accounts at scale.

## 2. Claude Code

### 2.1 Headless execution and session controls

**Vendor facts**

- `claude -p` runs Claude Code non-interactively. The CLI exposes `text`, `json`, and `stream-json`
  output, text or stream-JSON input, `--max-turns`, model selection, explicit allowed/disallowed
  tools, `--permission-mode`, an MCP permission-prompt tool, `--continue`, `--resume`,
  `--fork-session`, `--session-id`, `--no-session-persistence`, `--strict-mcp-config`, and
  `--worktree` ([CLI reference](https://code.claude.com/docs/en/cli-usage)).
- Anthropic recommends `--bare` for scripted/SDK calls. Bare mode skips automatic discovery of
  hooks, skills, plugins, MCP servers, auto memory, and `CLAUDE.md`; it also skips OAuth/keychain
  reads, so authentication must be supplied explicitly by an API key or configured key helper.
  Without bare mode, a print run loads the same local/project context as an interactive session
  ([programmatic mode](https://code.claude.com/docs/en/headless)).
- Claude Code permissions are fine-grained and layered. Persistent “don't ask again” Bash rules are
  saved at repository scope and apply across the repository's worktrees; edit approval lasts only to
  session end. Deny/ask rules can remove tools or constrain command patterns. MCP tools have
  canonical names and can be denied globally or allowed only for a named server
  ([permissions](https://code.claude.com/docs/en/permissions)).

**Opzava inferences**

- The Claude adapter should use `claude -p`/Agent SDK with streaming structured output and explicit
  `cwd`, tool inventory, settings sources, MCP config, permission mode, model, spend/turn limits,
  and session-persistence choice.
- `--bare` is the most reproducible automation mode, but its authentication model can conflict with
  a user's existing subscription login. Enrollment must record which launch profile is supported:
  reproducible explicit-credential mode or user-session mode with an audited effective
  configuration. The adapter must not pretend those modes have the same trust or portability.
- Repository-wide persistent Claude permissions are broader than one DevTicket lease. Opzava should
  generate per-run restrictive settings/tool policy and reject a launch whose effective permissions
  are wider than policy; it should not write broad “allow always” rules on the user's behalf.

### 2.2 Hooks: strong local interlocks, incomplete receipts

**Vendor facts**

- Claude hooks receive JSON on stdin with lifecycle-specific data. Available events include pre/post
  tool use, permission requests/denials, session start/end, stop/failure, config and cwd changes,
  file changes, worktree create/remove, tasks, subagents, and MCP elicitation
  ([hooks](https://code.claude.com/docs/en/hooks)).
- For command hooks, exit `2` blocks only events that are still blockable, such as `PreToolUse`,
  permission requests, prompts, selected task transitions, and worktree creation. Post-tool events
  cannot undo a tool that already ran. Other non-zero codes are non-blocking for most events.
  HTTP-hook non-2xx, connection failure, or timeout is also non-blocking; an HTTP hook must return a
  successful JSON decision to block an eligible action
  ([hook exit behavior](https://code.claude.com/docs/en/hooks#exit-code-2-behavior-per-event)).
- `StopFailure` is notification/logging only. `SessionEnd` is cleanup/logging only, has no decision
  control, and receives a bounded cleanup budget. Hook input includes local session/transcript/cwd
  identifiers, but the docs do not describe a provider signature over those inputs
  ([hooks](https://code.claude.com/docs/en/hooks#stopfailure),
  [hooks](https://code.claude.com/docs/en/hooks#sessionend)).

**Opzava inferences**

- Install versioned Opzava hooks as defense-in-depth for launch policy, tool observation,
  stop/failure notification, and worktree lifecycle, but do not make hook delivery the sole
  completion proof.
- The Runner supervisor must independently observe child PID/process-group state, stdout/stderr,
  exit status, current Git `HEAD`, worktree cleanliness, checkpoint files, and containment commands.
- Hook observations become evidence only after the local Runner validates their session/attempt
  binding, assigns a monotonic Runner sequence, and signs/authenticates the receipt to Opzava.
- Any policy requiring fail-closed behavior must execute locally before the side effect. A remote
  HTTP hook whose outage is documented as non-blocking is unsuitable as the only security gate.

### 2.3 Worktrees and checkpoint limitations

**Vendor facts**

- `claude --worktree` creates an isolated worktree and branch. Current defaults derive from
  `origin/HEAD` (with documented fallback) unless `worktree.baseRef` is set to `head`; arbitrary
  refs are not accepted by that setting. A non-interactive `-p --worktree` run skips the interactive
  workspace trust check, and non-interactive worktrees are not automatically cleaned up
  ([worktrees](https://code.claude.com/docs/en/worktrees)).
- Claude's `.worktreeinclude` can copy gitignored files into new worktrees. Repository permission
  approvals are shared across worktrees. Claude also locks worktrees used by active background
  sessions against its cleanup sweep ([worktrees](https://code.claude.com/docs/en/worktrees)).
- Claude checkpoints track edits made by Claude's file-editing tools, not changes made by Bash or
  external concurrent processes. Anthropic explicitly says checkpointing is not a replacement for
  Git/version control ([checkpointing](https://code.claude.com/docs/en/checkpointing)).

**Opzava inferences**

- As with Codex, create the exact branch/worktree before launching the harness. Record the
  worktree's canonical path, Git common directory, branch ref, base SHA, candidate SHA, and
  ownership marker.
- A Claude checkpoint or transcript is useful recovery context but cannot prove the repository
  state. Git commits plus Runner-observed worktree/process facts remain the durable code evidence.
- Cleanup must be an explicit, idempotent Runner command after lease release/review handoff. Never
  infer safe deletion merely because a Claude session ended.

### 2.4 Claude Remote Control is not Opzava Remote Control

**Vendor facts**

- Anthropic labels Claude Code Remote Control a research preview. It connects claude.ai/mobile to a
  process that continues to execute and access files on the user's machine. It uses outbound HTTPS,
  opens no inbound port, stores the synchronized transcript on Anthropic servers, and reconnects
  after ordinary sleep/network interruption
  ([Remote Control](https://code.claude.com/docs/en/remote-control)).
- Server mode can spawn sessions in the same directory or separate worktrees and has an explicit
  capacity. Same-directory mode can conflict when concurrent sessions edit the same files. Server
  mode's sandbox is off by default. Remote Control requires claude.ai authentication; API keys,
  alternate inference endpoints, and some compliance modes are not supported
  ([Remote Control](https://code.claude.com/docs/en/remote-control)).
- The local process must remain running. An extended network outage can time the process out and
  make it exit. Remote Control is a vendor path between Claude clients and Claude Code, not a
  documented third-party API for Opzava
  ([Remote Control limitations](https://code.claude.com/docs/en/remote-control#limitations)).

**Opzava inference**

Treat Claude Remote Control as an optional user-facing vendor capability, not as the Dev Board
Runner transport. Opzava still needs its own enrollment, lease fencing, receipts, Slack actions,
secret grants, and disconnect policy. The existence of a vendor reconnection path is not permission
to resume a fenced Opzava execution.

### 2.5 Claude evidence gaps

- Anthropic documents structured streams but does not establish a signed, cross-version stable
  receipt schema with DevTicket/fence binding.
- The exact supported-version matrix for hook events, background sessions, worktree behavior, and
  permission modes must be probed; the current docs contain numerous version-qualified changes.
- The safe way to automate a user's subscription-backed Claude Code login from an Opzava controller,
  including product/terms constraints, is not established by the technical docs reviewed here.
- Remote Control's proprietary service does not document an Opzava-addressable control or evidence
  API. Do not infer one from its UI behavior.

## 3. Git, branches, and GitHub

### 3.1 Git worktree facts

**Vendor fact**

Git supports a main worktree plus linked worktrees that share repository metadata while having
separate working directories. `git worktree add` associates extra metadata with a linked worktree,
and `git worktree remove` is the normal cleanup operation
([git-worktree](https://git-scm.com/docs/git-worktree.html)). A branch cannot safely be treated as
two independent mutable worktree owners at once; each active DevTicket execution therefore needs its
own branch/worktree identity.

**Opzava inference**

The Runner, not the model, should be the sole creator/owner of the lease worktree. Every mutating
Runner command should verify that the canonical worktree path, Git common directory, branch ref,
base SHA, lease ID, and current fence still match the lease before acting.

### 3.2 GitHub App authority and credentials

**Vendor facts**

- GitHub distinguishes App JWT authentication, installation authentication, and acting on behalf of
  a user. Installation authentication is intended for automation attributed to the App; user access
  tokens are appropriate when an action must be limited to and attributed to a user
  ([GitHub App authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app)).
- Installation access tokens expire after one hour and can be narrowed to selected repositories and
  a subset of the App's granted permissions. They cannot exceed the installation's repository or
  permission grants
  ([installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)).
- A user access token is limited by the intersection of the App's and user's access. Default
  expiring user tokens last eight hours and can be revoked; GitHub emits an authorization webhook
  when a user revokes the App
  ([user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)).

**Opzava inferences**

- For the current single-repository scope, mint short-lived installation tokens narrowed to the
  Opzava repository and the exact operation. Do not distribute the App private key or long-lived
  installation material to a local Runner.
- Distinguish App automation from user-attributed actions in the audit. A Slack click or Ask Admin
  request may authorize an Opzava command, while the eventual GitHub write is still performed by the
  App and linked to that command/actor in Opzava audit.
- Credential expiry/revocation is a provider-health input. It never authorizes a stale command
  retry.

### 3.3 Webhook verification, retries, and reconciliation

**Vendor facts**

- GitHub signs webhook payloads with HMAC-SHA256 in `X-Hub-Signature-256`. Consumers should verify
  the original raw body with the configured secret and a constant-time comparison before processing
  ([webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)).
- GitHub recommends responding with 2xx within ten seconds and queueing asynchronous processing. It
  recommends using `X-GitHub-Delivery` as the unique event delivery identity to defend against
  replay. A requested redelivery retains the same delivery ID
  ([webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)).
- GitHub does not automatically redeliver failed webhook deliveries. Authorized operators can
  manually redeliver deliveries from the past three days through the UI/API
  ([redelivery](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks)).

**Opzava inferences**

- Verify signature and App/installation/repository identity, persist a unique inbox row keyed by
  delivery ID, acknowledge quickly, and process idempotently after commit.
- Webhooks are hints/facts, not ordered workflow commands. Reconcile GitHub-native issue, PR,
  commit, check, review, and merge state from the API after gaps, redelivery, or health recovery.
- A duplicate or stale webhook must reproduce the prior result or no-op; it must never rerun a
  DevTicket transition because the transport retried.

### 3.4 Branch/ruleset gates

**Vendor facts**

GitHub rulesets can require pull requests, reviews, resolved comments, signed commits, and status
checks. Multiple applicable rulesets and branch protection rules aggregate, with the most
restrictive version applying. Required checks can be restricted to an expected GitHub App source
([ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[ruleset layering](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)).

**Opzava inference**

GitHub gate state is provider evidence that Opzava projects onto the card. It does not replace the
Review or Release aggregate. A GitHub bypass event should enter the already-locked “Needs Human
Approval” path unless it is an absolute stop such as secret exposure or unhealthy/unverifiable
GitHub integration.

## 4. Slack Personal Assistant transport

### 4.1 Verification and event idempotency

**Vendor facts**

- Slack signs HTTP requests with an HMAC-SHA256 signing secret. Verification uses the raw body,
  `X-Slack-Request-Timestamp`, and `X-Slack-Signature`; Slack's example rejects timestamps more than
  five minutes from local time to limit replay and recommends constant-time comparison
  ([request verification](https://api.slack.com/authentication/verifying-requests-from-slack)).
- Events API envelopes include a globally unique `event_id`. Slack requires an HTTP 2xx within three
  seconds, recommends queueing after acknowledgement, and retries failed deliveries up to three
  times on a documented backoff with retry headers
  ([Events API](https://api.slack.com/apis/connections/events-api)).
- Socket Mode uses a pre-authenticated WebSocket. Each envelope has an `envelope_id` and still
  requires acknowledgement so Slack knows whether to retry
  ([Socket Mode](https://api.slack.com/apis/connections/socket)).

**Opzava inferences**

- HTTP mode: verify signature/timestamp before enqueueing, key the durable event inbox by
  workspace/App/event identity, and acknowledge within the Slack deadline. Socket mode: persist and
  deduplicate the envelope/event identity before applying commands.
- Slack's signed request proves delivery from Slack, not that the named user currently has Opzava
  Admin authority. Resolve workspace/user through the enrolled connection and re-authorize the exact
  command against current Opzava RBAC and aggregate versions.

### 4.2 Interactive decisions are transport gestures, not durable approval

**Vendor facts**

- Interactive payloads require acknowledgement within three seconds. A payload may provide a
  `response_url`; Slack permits up to five responses in thirty minutes. A `trigger_id` expires in
  three seconds and can be used only once
  ([interactivity](https://api.slack.com/interactivity/handling)).

**Opzava inferences**

- Every approval/exception button must carry only an opaque, one-time Opzava action nonce bound to
  tenant/admin, exact command, aggregate IDs/versions, approval/request hash, and expiry. The button
  value must not contain a credential, secret ref resolver detail, free-form command, or reusable
  bearer authority.
- Slack acknowledgement is separate from command completion. Acknowledge quickly, then edit/post a
  safe status after the Opzava command reaches a terminal receipt.
- Secret entry and machine enrollment remain secure Admin UI flows. Slack may notify and deep-link;
  it must not collect or echo secret values.

### 4.3 Slack evidence gaps

- Events have `event_id`, while interactive payloads use different identifiers and do not establish
  a universal domain idempotency key. Opzava's one-time nonce is therefore required.
- Slack delivery does not guarantee global ordering across event types, retries, and Web API writes.
  Aggregate expected versions and an inbox/outbox are required.
- This research does not choose HTTP Events API versus Socket Mode for Opzava. Deployment topology,
  inbound exposure, reconnect behavior, and operations must be resolved separately.

## 5. Local Docker Review stack and preview exposure

### 5.1 Health and readiness

**Vendor facts**

- A Compose `healthcheck` defines the command and timing Docker uses to classify container health.
  `depends_on.condition: service_healthy` waits for that healthcheck; ordinary startup order waits
  for a container to run, not necessarily to be ready
  ([Compose services](https://docs.docker.com/reference/compose-file/services/),
  [startup order](https://docs.docker.com/compose/how-tos/startup-order/)).
- Published Compose ports map host to container ports. If no host IP is specified, Docker binds to
  all interfaces (`0.0.0.0`); Docker warns this can expose the container directly to the internet.
  An explicit `127.0.0.1` host binding confines the published port to loopback where supported
  ([Compose services: ports](https://docs.docker.com/reference/compose-file/services/#ports)).

**Opzava inferences**

- A Runner review-stack receipt should include Compose project/config identity, selected service
  set, immutable image digests where available, container IDs, declared health states, probe time,
  and the result of an Opzava application-level readiness/behavior probe.
- “Container healthy” proves only the configured health command. It is not evidence that acceptance
  criteria, user-level E2E behavior, GitHub integration, or preview authorization works.
- Bind local development services to loopback by default. Remote human preview should use a
  separate, authenticated, revocable, lease-bound tunnel/proxy to the HTTP surface, never a broad
  `0.0.0.0` publication as an accidental tunnel.

### 5.2 Docker daemon authority

**Vendor facts**

- Docker uses a local Unix socket by default. Docker warns that controlling the daemon can grant
  root-equivalent access to the host, and that an unauthenticated network daemon creates severe host
  compromise risk. Remote daemon access should use SSH or mutually authenticated TLS, and the
  credentials must be guarded like a root password
  ([Engine security](https://docs.docker.com/engine/security/),
  [protect the daemon socket](https://docs.docker.com/engine/security/protect-access/)).

**Opzava inferences**

- Never expose `/var/run/docker.sock` or the Docker Engine API to the cloud orchestrator, browser,
  Slack, an MCP client, or a model. Only a locally enrolled Runner component with a narrow operation
  API may exercise Docker authority.
- Do not mount the Docker socket into an unconstrained agent container. The Runner should validate a
  fixed Compose project/root and bounded command vocabulary, and should return sanitized facts
  rather than raw daemon objects or environment/config content.
- Docker access is a separately attested Runner capability. A harness may work on code without it,
  but local Review admission must fail when the exact local Docker capability/health proof is
  absent.

### 5.3 Docker/preview evidence gaps

- No tunnel product or protocol has been selected or researched here. Before exposing a local
  preview, Wayfinder must compare first-party support for authentication, outbound-only
  connectivity, URL lifetime, revocation, audience binding, request logging/redaction, and teardown
  confirmation.
- Compose health alone does not define the required Opzava E2E probe or seeded-data contract.
- Cross-platform Docker availability (Docker Engine, Docker Desktop, rootless alternatives) needs an
  explicit supported Runner matrix and real enrollment probes.

## 6. Pinned OpenClaw capabilities

### 6.1 Version boundary

**Pinned fact**

The tracked `mainframe/` fork records OpenClaw upstream `v2026.6.11`, commit `bd2740fedc`, imported
2026-07-04. Its bump procedure requires deliberate diff/reapplication and real-stack verification;
an unpinned upstream page is not sufficient authority
([UPSTREAM.md](../../../mainframe/UPSTREAM.md)).

### 6.2 Device, Node, and Runner are different identities

**Pinned facts**

- An OpenClaw Node is a companion endpoint connected to the Gateway WebSocket with role `node`. It
  is a peripheral, not a Gateway. Device pairing is the durable approved-role contract, while the
  separate node-pairing store and live command declaration/policy control different concerns
  ([Nodes](../../openclaw/nodes/index.md), [Gateway pairing](../../openclaw/gateway/pairing.md)).
- A remote node host can execute `system.run`/`system.which` on another machine. The model still
  talks to the Gateway, and the Gateway forwards an explicit node-host execution. Exec approvals are
  enforced on that node host. Command exposure requires both node declaration and Gateway policy
  ([Nodes](../../openclaw/nodes/index.md)).
- Pairing tokens and pending requests have their own lifecycle. Changed auth details can supersede a
  pending request; node removal revokes the node role and disconnects node-role sessions. OpenClaw's
  docs explicitly warn that pairing does not pin the live command surface or replace per-node exec
  policy ([Gateway pairing](../../openclaw/gateway/pairing.md)).

**Opzava inferences**

- Reuse OpenClaw Node/Device capabilities only through an adapter. Store opaque OpenClaw refs on an
  enrolled machine as capability evidence; do not make an OpenClaw token, pairing row, or declared
  command list the Runner enrollment itself.
- An Opzava machine enrollment must bind its own key, owner/admin, platform, supported adapter
  builds, harness versions, repository/worktree roots, Docker capability, and revocation state.
- Node removal or OpenClaw role loss is a capability-health event that can fence affected work, not
  proof that an Opzava process stopped or its worktree is clean.

### 6.3 Native Codex and ACP external harnesses

**Pinned facts**

- The pinned OpenClaw runtime has a native Codex app-server harness. Codex owns its native thread,
  resume, compaction, and app-server execution, while OpenClaw owns channel delivery, transcript
  mirror, tool policy, approvals, media delivery, and session selection. Explicit runtime selection
  can fail closed rather than silently fall back
  ([agent harness SDK](../../openclaw/plugins/sdk-agent-harness.md)).
- OpenClaw ACP sessions can run external harnesses such as Claude Code and an explicit Codex ACP
  fallback. OpenClaw owns routing, background-task state, conversation binding, and policy; the
  external harness owns provider login, model catalog, filesystem behavior, and native tools. ACP
  runs use an explicit `cwd`; permission profiles must work headlessly because non-interactive runs
  cannot click native prompts ([ACP agents](../../openclaw/tools/acp-agents.md)).
- ACP session lifecycle includes spawn/resume, cancel, close, background task tracking, bindings,
  and cleanup, but ACP sessions currently run on the host runtime rather than inside the OpenClaw
  sandbox. The external harness can read/write according to its own CLI permissions and selected
  `cwd` ([ACP agents](../../openclaw/tools/acp-agents.md)).

**Opzava inferences**

- OpenClaw can be the Personal Assistant/orchestration substrate and can host native Codex or ACP
  adapters, but Dev Board execution still requires the independent Opzava Execution Lease and Runner
  protocol.
- Record the actual runtime path (`codex-native`, `acp-claude`, `acp-codex`, direct local adapter,
  or admitted cloud adapter), harness/session ID, model, permission profile, and `cwd`. Never label
  all of them simply “OpenClaw run.”
- Explicit runtime failure must stay failure. Do not silently retry a local native/ACP execution on
  a different runtime, model, machine, or cloud Runner under the same lease.

### 6.4 Exec approvals do not grant domain authority

**Pinned facts**

- OpenClaw exec approval is a local guardrail layered on tool policy and elevated policy. The
  effective policy is the stricter combination of configured and host-local policy, and the default
  no-UI fallback is deny. Approval is enforced on the actual execution host
  ([exec approvals](../../openclaw/tools/exec-approvals.md)).
- OpenClaw explicitly states exec approvals are not a per-user authorization boundary or a
  filesystem read-only policy. An approved command can mutate anything the selected host/sandbox
  identity can access. Approval binding for script/interpreter operands is best effort and refuses
  some ambiguous cases rather than claiming full coverage
  ([exec approvals](../../openclaw/tools/exec-approvals.md)).

**Opzava inference**

OpenClaw exec approval may be reconciled as a runtime approval ref, but it cannot approve Ready,
assign a DevTicket, grant a lease, satisfy Human Approval, authorize a Review verdict, or merge a
PR. Opzava command authorization runs first; local tool/exec policy then narrows execution.

### 6.5 SecretRefs and health

**Pinned facts**

- OpenClaw SecretRefs keep supported credentials out of plaintext config, resolve active refs into
  an in-memory snapshot, fail startup/reload when an active ref cannot resolve, and atomically
  retain the last-known-good snapshot on a failed reload. Plaintext remains supported, and
  SecretRefs are not a process-isolation boundary. Readable plaintext residue remains agent-readable
  ([SecretRefs](../../openclaw/gateway/secrets.md)).
- OpenClaw documents machine-readable health snapshots and a dedicated `/health` endpoint. It warns
  that session rows are not live channel connectivity and that health/diagnostic exports must redact
  credentials and raw sensitive content ([health](../../openclaw/gateway/health.md)).

**Opzava inferences**

- OpenClaw SecretRefs can back OpenClaw-owned credentials, but DevTicket named secrets need a
  separate Opzava grant record. The DevTicket stores only the approved secret-ref identity/purpose;
  a lease-bound local broker resolves a value into the narrow process at execution time.
- “Revoked” requires confirmation from the owning secret provider or verified destruction of the
  local grant, not deletion of a reference string. Cards, worklogs, receipts, transcripts, Slack,
  GitHub, hooks, and diagnostic exports must never carry the value.
- OpenClaw health is one capability input. Runner health must additionally prove the enrolled
  machine, controller build, adapter version, supported harness/auth state, repository/worktree
  reachability, local Docker state where required, and control-channel freshness.

## 7. Evidence-backed provisional protocol constraints

The following are **Opzava inferences for #232 synthesis**, not vendor facts and not yet locked:

### 7.1 Identities that must remain separate

| Identity                       | Owns                                                                                 | Must not be accepted as                               |
| ------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Human/agent principal          | request intent and current Opzava authorization                                      | machine possession or process state                   |
| Machine enrollment             | local controller public key, owner, admitted capabilities, build/version, revocation | actor authorization or DevTicket assignment           |
| Runner                         | selected execution location/control endpoint                                         | agent/model or OpenClaw Node                          |
| Harness adapter                | Codex/Claude/OpenClaw launch translation and observation normalization               | workflow authority                                    |
| Harness session/thread         | provider-native conversational/runtime continuation                                  | Execution Lease or worktree identity                  |
| Execution Lease                | DevTicket/Ready/Runner/fence/capacity authorization                                  | provider login or Review authority                    |
| Slack/GitHub/OpenClaw identity | external transport/provider fact                                                     | Opzava RBAC without current mapping and authorization |

### 7.2 Enrollment and capability attestation

1. The local controller generates or loads a machine-scoped key from OS-protected storage; the
   private key never leaves the machine.
2. Secure Admin starts a short-lived, single-use enrollment challenge bound to the signed-in Admin,
   intended machine, tenant, and expiry. Slack and Ask Admin may deep-link to it but cannot complete
   enrollment themselves.
3. The controller signs the challenge and reports only safe inventory: platform/architecture,
   controller build digest, supported adapter IDs/builds, harness binary canonical path and version,
   safe auth-health state, repository/worktree-root proof, Docker capability/health, supported MCP
   capability digests, and local OpenClaw opaque refs where applicable.
4. The server admits a versioned capability manifest and returns an enrollment ID/certificate or
   equivalent bound credential. Re-enrollment cannot silently expand capabilities; material key,
   binary, adapter, tool, Docker, repository-root, or platform drift requires re-attestation and may
   require Admin approval.
5. Revocation immediately prevents new commands and advances/fences every affected lease. It does
   not claim a running process stopped until containment confirmation/reconciliation arrives.

Primary-source support for hardware-backed attestation is absent; v1 should call this **signed
software capability attestation**, not device integrity proof.

### 7.3 Outbound control channel and command envelope

- Prefer an outbound authenticated channel from the local controller to Opzava. Do not require an
  inbound Docker, shell, Codex, Claude, or OpenClaw port.
- Every command is immutable and keyed by `{command_id, lease_id, fence_token, attempt_id}` with an
  expected aggregate/version set, one-time nonce, issued/expiry time, command kind, exact adapter,
  exact `cwd`/worktree identity, requested policy digest, and payload digest.
- The controller verifies signature/audience/expiry/enrollment, current local fence, adapter
  support, worktree/repository identity, and command sequence before action. Duplicate commands
  return the prior receipt; lower fences are rejected; gaps trigger reconciliation rather than
  speculative execution.
- The server never sends a shell string as authority. Commands are typed operations such as
  `prepare_worktree`, `launch`, `steer`, `checkpoint`, `cancel`, `contain`, `probe_stack`,
  `open_preview`, `close_preview`, and `release`. The adapter owns any provider-specific argv.

### 7.4 Ordered receipts and reconciliation

- Each receipt is authenticated by the enrolled controller and binds enrollment, Runner, lease,
  fence, attempt, monotonic local sequence, command ID where applicable, observed time, controller
  build, adapter/harness version, process/session/worktree refs, safe result, and payload digest.
- Acknowledgement means durable receipt, not successful execution. Terminal success requires the
  command-specific evidence: accepted start plus observed process, exact checkpoint, confirmed
  containment, Git state, or provider exit.
- On reconnect, the controller reports the last accepted server sequence, last emitted local
  sequence, active PID/process-group identity, harness session, worktree/branch/HEAD/dirty summary,
  checkpoint digest, preview/tunnel status, Docker status, and secret-grant status. The server
  returns an explicit reconcile decision.
- No automatic failover: loss/expiry/revocation fences the execution, preserves the worktree,
  creates a safe summary/checkpoint when possible, and notifies the Admin through Slack. A later
  local resume or cloud claim is a new admitted attempt.

### 7.5 Worktree isolation

- One active execution gets one branch plus linked worktree; branch/worktree ownership is recorded
  in the lease and cannot be shared by two active attempts.
- The controller, not the harness, creates it from the exact approved base SHA and verifies it
  before every mutating control command.
- Provider checkpoints/transcripts supplement Git. Durable checkpoints include commit/HEAD, dirty
  summary, changed-path digest, and safe execution summary. They never include secret values.
- Cleanup occurs only after the owning workflow authorizes release and the controller proves no
  active process, no required uncommitted work, preview/tunnel closed, secret grant revoked, and Git
  worktree removal result.

### 7.6 Named-secret grant boundary

- Ready holds the exact **secret reference IDs and purposes** the human approved, never values.
- Execution Admission asks the Secrets owner for a lease-bound, adapter/purpose-scoped access grant.
  The value is resolved only on the selected Runner and injected through the narrowest supported
  mechanism for the exact process/operation.
- Environment injection is not inherently confidential from a child process or its descendants. The
  controller must sanitize inherited environment, avoid verbose tracing, redact
  stdout/stderr/events, and prefer local broker/file-descriptor/provider mechanisms where supported.
- The controller reports only grant state and confirmation refs. Secret access must never be copied
  to Codex/Claude prompts, hooks, MCP config committed to the repo, `.worktreeinclude`, GitHub,
  Slack, DevTicket detail, or worklogs.
- Expiry, cancellation, containment, revision invalidation, review submission, and lease release all
  trigger revocation. Revocation pending is not revoked.

### 7.7 Deterministic acceptance seams

The eventual implementation ticket should prove at real seams:

1. **Enrollment replay:** the same challenge cannot enroll twice; expired/wrong-Admin/wrong-tenant
   challenges fail without a machine row.
2. **Capability drift:** unsupported adapter/version, changed key, lost auth, wrong repository root,
   or missing Docker capability fails admission without starting a process.
3. **Start idempotency:** duplicate delivery returns the same start disposition and never launches a
   second process.
4. **Fence:** a stale command/receipt after interruption, revocation, expiry, or new attempt cannot
   mutate workflow state or continue execution.
5. **Crash before/after start:** recovery distinguishes no process started, process uncertain, and
   process observed; it never releases capacity/worktree/secrets from an ambiguous observation.
6. **Receipt order:** duplicate, reordered, and missing sequences reconcile deterministically.
7. **Disconnect:** local loss pauses; no cloud process starts; checkpoint/summary and one Slack
   notification are durable and idempotent.
8. **Worktree ownership:** wrong repo/common-dir/branch/base/path or shared active worktree is
   rejected.
9. **Secret non-propagation:** canaries are absent from
   command/event/receipt/card/worklog/GitHub/Slack payloads and logs; revoke/expiry prevents later
   access.
10. **Slack retry:** duplicate Events/interactive delivery applies one command and reproduces one
    safe response.
11. **GitHub redelivery/gap:** duplicate delivery is a no-op; reconciliation repairs missed provider
    facts without replaying workflow commands.
12. **Docker boundary:** Review probe works through the local controller; raw Docker API/socket is
    not remotely reachable; container health without behavioral success cannot pass Review.

## 8. Unresolved evidence gaps and required follow-up

These gaps should remain explicit blockers to claiming the final protocol is proven:

1. **Supported harness/version matrix.** Record minimum tested Codex and Claude Code versions,
   structured-event fixtures, exit/cancel behavior, auth-health probes, and incompatibility policy
   on Linux/macOS/Windows. Public docs alone are insufficient.
2. **Terms and account delegation.** Obtain primary product/terms guidance for Opzava remotely
   launching persistent consumer-subscription Codex/Claude sessions versus API/enterprise automation
   credentials. Do not assume technical login success grants product permission.
3. **Controller transport.** Select and threat-model the outbound protocol, enrollment key storage,
   certificate/token rotation, replay window, clock-skew handling, message persistence,
   backpressure, and multi-device revocation.
4. **No hardware attestation.** No reviewed source proves TPM/Secure Enclave-backed machine
   integrity for a cross-platform v1. Define the honest software-attestation claim and residual
   risk.
5. **Codex experimental protocols.** App-server and remote-control schemas need version-pinned
   source and real conformance tests before use beyond the stable `codex exec` path.
6. **Claude stream/hook compatibility.** Capture real stream/hook fixtures and failure behavior for
   each supported Claude version, especially process kill, background tasks, hook timeout, worktree
   cleanup, and resume after disconnect.
7. **OpenClaw implementation parity.** Drive pinned Node, native Codex, ACP Claude, permission
   relay, cancellation, resume, SecretRef, and health flows against `mainframe/`; documentation is
   not an execution proof.
8. **Preview tunnel.** Research and choose an authenticated outbound-only tunnel/proxy. Lock
   audience, TTL, Admin authorization, revocation, request limits, audit/redaction, DNS/certificate
   behavior, and teardown confirmation before exposing the local Docker web surface.
9. **Secret broker.** Select the owning Secrets module/provider contract, local resolution
   mechanism, redaction enforcement, renewal/revocation protocol, and proof that subprocess trees
   cannot retain access after lease loss.
10. **Slack topology.** Choose HTTP Events versus Socket Mode and prove verification, reconnect,
    duplicate actions, ordering, rate limits, and notification/update idempotency in the deployed
    topology.
11. **GitHub health definition.** Lock the probe set that distinguishes App registration,
    installation/repository access, webhook signature/delivery health, token mint/API access,
    ruleset visibility, and reconciliation freshness without leaking credentials.
12. **Cloud Runner boundary.** Specify its separate enrollment/isolation/secret mechanism. A cloud
    clone is not a continuation of a local lease, and cloud Review cannot satisfy the required local
    Docker Review evidence.

## Research conclusion

The provider products offer enough primitives for a provider-neutral Runner adapter, but not enough
authority to collapse the Runner into any one of them. The safe v1 baseline is an Opzava-enrolled,
outbound-connected local controller that owns exact worktrees, starts a version-admitted
child-process adapter (`codex exec` or `claude -p`), applies a policy no wider than the DevTicket
admission, emits authenticated ordered receipts, resolves only approved named-secret references
locally, and pauses on loss without automatic failover. OpenClaw can coordinate and host compatible
runtime adapters; GitHub and Slack remain verified, idempotent external transports; local Docker
remains a privileged local Review capability. The resolved protocol memo now fixes the target
command/signature/containment boundaries; preview transport details, provider terms, and real
harness/transport conformance remain implementation evidence obligations rather than authority that
can be inferred from vendor documentation.
