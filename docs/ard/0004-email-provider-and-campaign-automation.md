# ARD 0004: Email Provider And Campaign Automation Ownership

Status: Accepted
Date: 2026-06-17

## Context

Opzava's core thesis is that **the system owns orchestration** — sequence, validation, retries, approvals, cost, and audit — while external providers act as dumb workers. The platform already has a durable job runner, a provider-adapter contract (`ExternalCall` / `CostEvent` / `AuditEvent`), admin-configurable settings backed by `SecretReference`, and an 11-step content workflow it orchestrates natively.

The question is whether Opzava should self-host Plunk (useplunk.com) for email campaign automation, or use a managed email provider and own campaign automation itself.

A DRY check confirmed the base Mission Control fork has **no existing Resend, email, SMTP, or SES infrastructure** (verified by grep — no `resend`, `nodemailer`, `SES`, or `SMTP` dependency or code). Building a Resend provider is net-new work, not duplication.

## Options Considered

**(A) Self-host Plunk as the automation engine** — REJECTED. Plunk's automation engine becomes a second orchestration brain that duplicates and conflicts with Opzava's own thesis. Split-brain durable state with no clean adapter contract. Plunk still requires AWS SES to send — self-hosting it does not escape a sending provider; it only adds a contact store and automation UI that overlap Opzava's runtime. AGPL v3 (network copyleft) plus ops burden (Docker, Postgres, Redis, SES, DNS, upgrades) for marginal value.

**(B) Plunk as a pure SMTP relay** — REJECTED. Redundant with a managed adapter. Same AGPL and ops overhead for no benefit over a thin provider.

**(C) Managed Resend adapter + Opzava-owned campaign workflow** — **CHOSEN**. Resend is a thin sending provider. Opzava owns campaign automation as a native workflow, consistent with its existing architecture.

**(D) Direct AWS SES adapter** — Deferred. Optionally added later for bulk cost savings.

**(E) Listmonk / Mautic self-host** — Only Listmonk (MIT), and only if a non-engineer broadcast UI is ever required. Never Plunk or Mautic as the orchestrator.

## Decision

**Use Resend as the managed email sending provider (a thin provider adapter). Do not self-host Plunk. Opzava itself owns campaign automation as a native workflow.**

Resend connection configuration lives in admin settings and the setup wizard (slice `0071`). The email provider stays a thin worker — it sends, it does not orchestrate.

## Consequences

- Resend becomes the email provider, configured via admin settings and the setup wizard.
- Opzava builds a `CampaignWorkflow` (same shape as the existing content workflow) that emits `SendEmail` `ExternalCall`s via the Resend adapter, with `CostEvent` and `AuditEvent` per send.
- The email provider remains a dumb worker; all sequencing, retries, approvals, and audit live in Opzava.
- A direct AWS SES adapter may be added later for bulk cost reduction.
- Revisit Listmonk only if a non-engineer broadcast UI becomes a hard requirement.

## How It Was Decided

A local fleet deep-research run on 2026-06-17: grounded web search via `mmx`, five deepening iterations, and a multi-model consensus (Minimax-M3 and MiMo, both independently concluded **no** to self-hosting Plunk).
