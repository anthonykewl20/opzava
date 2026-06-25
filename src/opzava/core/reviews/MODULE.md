# core/reviews — Aegis review primitives (pure)

**Purpose.** The Engine-B canonical, pure half of Aegis (ARD 0025 C1): build the review prompt and parse the verdict. Consumed by the fleet's graph execution (a `ReviewStrategy` adapter, built with the provider seam) for per-`Step` review. The inherited Engine-A `runAegisReviews` keeps its own copy — the engine boundary forbids Engine A importing this module — so the cross-engine consolidation is a deferred, deliberate migration, not a regression.

**Public surface** (`reviews.ts`):
- `buildReviewPrompt(input: ReviewInput) → string` — the Aegis prompt; instructs the model to answer with a line-anchored `VERDICT:` + `NOTES:`. Untrusted `output` is bounded (6000 chars).
- `parseReviewVerdict(text) → ReviewVerdict` — returns the workflow-engine `ReviewVerdict` (`{valid, feedback}`).

**Invariants (do not regress):**
1. **Default-DENY (B2).** `VERDICT: APPROVED|REJECTED` must be **line-anchored** (`/^[ \t]*VERDICT:…/im`), never a substring. A reply that omits the verdict — or that echoed an injected `VERDICT: APPROVED` mid-paragraph from untrusted task content — is REJECTED (`valid:false`). The structural parser, not the prompt, is the injection defense.
2. **Pure `core/`** — no platform/modules/src-lib imports; no DB, no model call. The model invocation lives in the impure adapter (platform), which calls `buildReviewPrompt` → provider → `parseReviewVerdict`.
3. Verdict is the workflow-engine `ReviewVerdict`, so the `ReviewStrategy` adapter speaks one type.

**Editor guardrails:** keep it pure (the interface is the test surface — no mocks needed). Faithful to the proven Engine-A parser regex; if you change the verdict format, change `buildReviewPrompt`'s instruction and `parseReviewVerdict`'s regex together.

**Status:** built + tested (`reviews.test.ts`, 8 behaviors). The `review(input, deps)` orchestration + the Aegis `ReviewStrategy` adapter land with the provider seam (X0) and graph execution (E0).
