# WF-248 — Admin leaf-page pattern selection

**Ticket:** [#248](https://github.com/anthonykewl20/opzava/issues/248) (map #241 Admin Control
Center; prototype). **Date:** 2026-07-18. **Status:** resolved — pattern selected by owner.

## Decision
The Admin leaf-page structure is **Pattern A — tabbed sections** (concern tabs: Setup · Health ·
Repair · History), selected by the owner after comparing three structurally-distinct prototypes on
the GitHub Integrations exemplar leaf. Throwaway prototype + evidence:
`prototypes/wf248-admin-leaf-patterns/`.

## What every leaf keeps (pattern-independent; from #246 §2.3 / #245)
- The shared freshness/provenance envelope — source, version/checkpoint, `sourceAt`, `observedAt`,
  `staleAfter`, availability, last-known-good — on every section.
- The iron rule: stale / unknown / unavailable / not-configured never degrade to live · healthy · zero.
- Typed repair commands derived from current evidence (never "repair everything"); receipts
  source-owned; acceptance pending until a fresh readback proves the result.
- Bounded, source-attributed, deterministically-ordered history (dedupe by exact key, never timestamp).
- The anti-enumeration hard-403: a denied leaf leaks no existence / count / timestamp / LKG / deep-link.

## Rationale + rejected alternatives
Pattern A (tabs) — one concern in focus, minimal noise, 1:1 with the four-part contract; best for
set-up-once-then-monitor leaves. Rejected: **B** (progressive disclosure) — everything-in-reach but a
longer, order-biased page; **C** (scroll + sticky rail + drill-down drawer) — best for dense
always-on monitoring but the heaviest to build (a second layout system atop the scroll).

## Consumed by
Admin Control Center implementation (the #246 delivery graph): Admin leaf pages are built with the
tabbed structure. This resolves the last map #241 prototype question.
