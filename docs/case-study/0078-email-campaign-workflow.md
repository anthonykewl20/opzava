# 0078: Email Campaign Workflow
Date: 2026-06-17
Status: Draft
Thread: Opzava owns the orchestration of email campaigns, treating the email provider as a thin worker. This case study details the implementation of a robust, approval-gated workflow that ensures no message is sent without explicit consent.

## Hook
The allure of "set it and forget it" email automation is strong. Many platforms offer to handle everything for you, from audience segmentation to final send. But this convenience often comes at the cost of control, transparency, and safety. What happens when you need to guarantee that a campaign never fires without a human's final say?

## Product Stakes
An uncontrolled email blast is a high-stakes risk. Sending the wrong message to the wrong audience, or sending at the wrong time, can damage brand reputation, erode trust, and violate compliance standards. The core product stake is **control**. Opzava must provide a workflow where the sequence of operations is predictable, auditable, and gated by human approval. The email provider's role is reduced to that of a simple worker, executing a pre-defined and approved plan.

## Industry Counterfactual
The common industry pattern is to delegate orchestration to the email service provider (ESP). You configure campaigns, triggers, and audiences within the ESP's dashboard (e.g., Plunk, SendGrid, Mailchimp). The ESP becomes a second, opaque orchestration engine. This creates a split-brain problem: part of your logic lives in your application, and part lives in a third-party service. Debugging becomes a nightmare of cross-referencing logs, and guaranteeing a specific sequence of actions is nearly impossible.

## What We Built
We built an email campaign workflow module that internalizes the orchestration logic. The core is a schema and a runner.

The `emailCampaignSchema` defines the campaign's structure:
```typescript
interface EmailCampaign {
  schemaVersion: 1;
  campaignId: string;
  name: string;
  recipients: string[]; // >= 1 email address
  steps: Array<{
    stepId: string;
    subject: string;
    html: string;
  }>; // >= 1 step
  createdAt: Date;
}
```

The `runEmailCampaign` function is the engine. It accepts a dependency-injected `sender` (the thin worker) and a boolean `approvalGranted` flag.

```typescript
async function runEmailCampaign(
  deps: { sender: CampaignEmailSender; approvalGranted: boolean },
  campaign: EmailCampaign
): Promise<{ status: 'sent' | 'partial'; results: SendResult[] }>
```

Its behavior is strict:
1.  **Approval Gate:** If `approvalGranted` is `false`, it immediately throws an error (`'approval not granted, no messages sent'`). No emails are sent. This is the non-negotiable safety gate.
2.  **Execution:** If approved, it iterates through every `step` in the campaign and sends it to every `recipient` using the injected `sender`.
3.  **Recording:** It records the result of each individual send (`{stepId, to, ok, messageId}`).
4.  **Status:** It returns a final status of `'sent'` if all sends succeeded, or `'partial'` if any failed.

## What We Refused To Fake
1.  **No Auto-Send:** We refused to build a system where a campaign could be triggered and sent without an explicit, programmatic approval flag. The approval gate is a hard throw, not a soft warning.
2.  **No Provider as Orchestrator:** We refused to let the email provider (Resend, SendGrid, etc.) manage the campaign sequence. The provider is injected as a simple `CampaignEmailSender` interface. Opzava owns the loop, the records, and the logic. The provider is a worker.
3.  **No Opaque Failures:** We refused to let a single failed send silently halt the campaign or go unrecorded. Every send attempt is captured, and the final status reflects the aggregate outcome.

## Evidence
The implementation is validated by a comprehensive test suite.
- **Targeted Tests:** 4/4 tests pass, covering the core logic.
- **Full Suite:** ~1535 tests across ~195 files pass.
- **Type Safety:** `tsc` compiles with zero errors.
- **Code Quality:** `eslint` reports zero warnings or errors.

Key test scenarios:
- **Happy Path:** Sends every step to every recipient when approved (verifies sender is called `steps * recipients` times).
- **Approval Gate:** Halts with no sends when approval is not granted.
- **Partial Failure:** Reports `'partial'` status when a send fails.
- **Validation:** Rejects a non-email recipient.

## Validation
The workflow is validated by its adherence to a core architectural principle: **the platform owns the sequence, the provider executes the atomic action.** This mirrors the approval-gate pattern used in other content workflows, ensuring consistency and safety across the system. The injected sender allows for easy testing (mock) and future flexibility (swap providers).

## The Automation Lesson
True automation isn't about handing off control; it's about precisely defining and controlling the sequence of events. By owning the orchestration loop and enforcing a hard approval gate, Opzava provides powerful automation without sacrificing safety or transparency. The email provider is demoted to a utility, which is exactly where it belongs.

## Next Case Study Thread
The next step is to wrap the live Resend adapter (from case study 0077) as the concrete `CampaignEmailSender` implementation. This will allow an approved campaign to send real emails exactly-once via the platform boundary. Following that, we will build campaign scheduling, triggers, and audience management features.
