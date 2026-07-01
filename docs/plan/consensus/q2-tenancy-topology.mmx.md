**Pick: C (Hybrid).**

Three lines of rationale:
1. OpenClaw docs explicitly say cross-tenant separation is a *control-plane convenience* — not a hostile boundary — and recommend a separate Gateway per tenant when real customer channels and credentials are in play.
2. A free/eval tier doesn't carry customer credentials, so a shared Gateway (behind strict per-tenant scoping) is acceptable and cheap to operate, matching the product's tiered onboarding reality.
3. Paid/connected tiers (Slack, WhatsApp, Gmail) each tenant's gateway has its own profile, state, port, OS user, so a credential leak or misconfig in one tenant can't bleed into another.

**Single biggest risk:** Operational complexity — two deployment paths, two upgrade cadences, two sets of credentials to manage — and the temptation to "just put the next tenant on the shared Gateway." Guardrail: hard rule that any tenant with a real channel moves to a dedicated Gateway; shared tier is time-boxed.

**MVP vs scale:** Ship the shared Gateway path for the free tier on day one; provision per-tenant gateways via IaC the moment a tenant connects their first real channel.
