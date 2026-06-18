# 0081: Campaign Audience
Date: 2026-06-17
Status: Draft
Thread: Opzava treats the recipient list as a first-class typed artifact so no recipient is ever emailed twice. This case study covers the validated, deduped `campaignAudienceSchema` that owns audience state for the entire CampaignRun pipeline.

## Hook
Email is a one-way street: the moment you double-send to a person, you have burned trust they will not give back. Provider-side audience tooling treats dedupe as an operational afterthought — a setting you remember to flip, not a property of the data. Opzava flips that: the audience is a typed, validated, case-insensitively-unique artifact Opzava owns, not provider state the marketing team has to babysit.

## Product Stakes
A campaign audience is the contract between "we want to talk to these people" and "we are about to email them." If that contract is sloppy, three things break at once:

1. **Duplicate sends** — same recipient gets the same email twice, sometimes minutes apart.
2. **Stale provider state** — audience lives in Resend/Mailchimp/SendGrid, and what the platform sees diverges from what the operator thinks they approved.
3. **Untyped hand-off** — the composer passes a `string[]` and hopes; the scheduler passes another `string[]` and hopes harder.

Opzava's stakes are not theoretical. The CampaignRun pipeline (0082, 0083) will compose audience + schedule + approved sender into one approved run that fires each step exactly once. Every later case study in this thread is downstream of the audience being correct on day one.

## Industry Counterfactual
The standard pattern is: pull a CSV from a CRM, paste it into the ESP, hit "Import," trust the ESP's dedupe. The ESP dedupes by its own rules — sometimes case-sensitive, sometimes not, almost never exposed to the caller. The audience is then mutated by every subsequent campaign run in that ESP, and the operator has no typed handle on who is actually in "the list" anymore.

Opzava's counterfactual is to treat the audience the same way it treats every other artifact: a Zod-validated, version-stamped, machine-checked object that the platform owns end-to-end. Dedupe is a `superRefine`, not a hope.

## What We Built
`src/opzava/modules/content/workflow/campaign-audience.ts` (+ `.test.ts`):

- `campaignAudienceSchema` — `{ schemaVersion: 1, audienceId, name, recipients: email[] (>=1), createdAt }` with a `superRefine` that rejects case-insensitive duplicate recipients (`X@a.com` ≡ `x@a.com`).
- `parseCampaignAudience(input)` — the typed boundary; anything that crosses into the campaign workflow goes through it.
- `dedupeRecipients(emails)` — case-insensitive dedupe preserving first-seen order and original casing of the kept entry.

The shape is deliberately small. No provider IDs, no segment tags, no CRM foreign keys. Those belong in upstream artifacts (0080, content sources); the audience is the moment of truth before send.

## What We Refused To Fake
- **Case-insensitive uniqueness.** `X@a.com` and `x@a.com` are the same mailbox. Treating them as distinct because JavaScript string equality says so is a lie we refused to tell.
- **Email shape validation.** A "recipient" that isn't an email is not a recipient. The schema uses Zod's `email()` validator on every entry.
- **Audience as provider state.** The audience does not live in Resend. It lives in Opzava, typed, versioned, and reviewable. Resend receives the deduped list at send time; it does not own it.

## Evidence
- Targeted tests on `campaign-audience`: **4/4 passing** — parses a valid audience; rejects case-insensitive duplicate; rejects a non-email entry; `dedupeRecipients` preserves first-seen order with original casing.
- Full repository `vitest` run: **~1546 tests across ~198 files**, all green.
- `tsc`: clean.
- `eslint`: 0 warnings, 0 errors.

## Validation
The audience artifact is the gate. Anything that wants to enqueue a campaign must hand a `CampaignAudience` to the scheduler, and the scheduler must hand the same deduped list to the sender. There is no path through the workflow that takes a raw `string[]` and hopes — the type system and the Zod schema both say no.

## The Automation Lesson
"Exactly-once to a deduped audience" is not a property of the email provider; it is a property of the data you hand the provider. Push dedupe and validation into a typed artifact at the platform boundary, and every downstream component — composer, scheduler, sender, UI — inherits correctness for free. The moment you trust the ESP to dedupe for you, you have outsourced a correctness invariant to a system you do not control.

## Next Case Study Thread
**0082** will compose `CampaignAudience` + `CampaignSchedule` + the approved Resend sender into a single `CampaignRun` artifact; when approved, each scheduled step sends to the deduped audience exactly once via the platform boundary. **0083** layers in the Opus-designed UI for composing and approving campaigns against these typed artifacts.
