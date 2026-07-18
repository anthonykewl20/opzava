# WF-248 — Admin leaf-page pattern prototype (throwaway)

Question (#248): which leaf-page structure best exposes setup, status, repair, history, and
drill-down across the Admin page families, keeping the approved Variant A shell + Overview fixed —
for human selection?

`leaf-patterns.html` is a self-contained, dependency-free comparison of THREE structurally-distinct
leaf-page patterns on the GitHub Integrations leaf (the #245 exemplar: enrollment / health / repair /
history), each carrying the same WF-246 §2.3 freshness/provenance envelope, the iron rule (stale
never degrades to healthy), and the anti-enumeration hard-403 state. Open it in a browser and use the
top switcher (A · Tabs / B · Disclosure / C · Scroll+rail / 403 Deny). Light/dark toggle included.

## SELECTED (2026-07-18): Pattern A · Tabbed sections
The owner selected **Pattern A — tabbed sections** (Setup · Health · Repair · History) as the Admin
leaf-page structure. Rationale: one concern in focus with minimal noise; the tabs map 1:1 to the
four-part leaf contract; best fit for leaves that are set up once then lived-in via Health. Accepted
tradeoff: cross-concern scanning costs a click — mitigated by surfacing the degraded-dimension count
in the leaf header and on the Health tab.

Patterns B (progressive disclosure) and C (scroll + rail + drawer) remain in the file as the rejected
alternatives / evidence for the choice.

Throwaway prototype — not production code. The real leaf pages are built during Admin Control Center
implementation against the #246 delivery graph, using the selected tabbed structure.
