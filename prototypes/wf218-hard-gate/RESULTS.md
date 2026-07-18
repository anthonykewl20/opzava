# wf218 corrected hard-gate prototype results

Command: `node prototypes/wf218-hard-gate/demo.mjs`

Exit code: `0`

```text
PASS S1 tool-path autonomous direct-Done rejected
PASS S2 tool-path human-token direct-Done still rejected and token retained
PASS S3 create-with-done rejected
PASS S4 AdmitDone incomplete proofs rejected fail-closed
PASS S5 AdmitDone full proof chain accepted exactly once
PASS S6 AdmitDone post-authorization failure rolls back atomically
PASS S7 confirm-token mechanics on representative non-terminal action

activityLedger:
  #1 {"action":"admit-done","source":"system","actingPrincipal":"dev-board-admission","target":"5","transition":"review->done","confirmTokenRef":null,"decision":"accepted","timestamp":"2026-07-18T08:00:00.000Z"}
  #2 {"action":"move-to-review","source":"human-commanded","actingPrincipal":"admin-owner","target":"9","transition":"in_progress->review","confirmTokenRef":{"tokenId":"token-4","consumedAt":"2026-07-18T08:00:01.001Z"},"decision":"accepted","timestamp":"2026-07-18T08:00:01.001Z"}

securityLog:
  #1 {"event":"terminal-bypass-attempt","action":"move-task","source":"autonomous","actingPrincipal":"admin-1","target":"1","transition":"in_progress->done","confirmTokenRef":null,"hardReason":"done-requires-admit-done","decision":"rejected","timestamp":"2026-07-18T08:00:00.000Z"}
  #2 {"event":"terminal-bypass-attempt","action":"move-task","source":"human-commanded","actingPrincipal":"admin-2","target":"2","transition":"in_progress->done","confirmTokenRef":{"tokenId":"token-1","consumedAt":null},"hardReason":"done-requires-admit-done","decision":"rejected","timestamp":"2026-07-18T08:00:00.000Z"}
  #3 {"event":"terminal-bypass-attempt","action":"create-task","source":"autonomous","actingPrincipal":"admin-3","target":null,"transition":"none->done","confirmTokenRef":null,"hardReason":"create-with-terminal-status","decision":"rejected","timestamp":"2026-07-18T08:00:00.000Z"}
  #4 {"event":"done-admission-rejected","action":"admit-done","source":"system","actingPrincipal":"dev-board-admission","target":"3","transition":"review->done","confirmTokenRef":null,"hardReason":"ready-approval-absent","decision":"rejected","timestamp":"2026-07-18T08:00:00.000Z"}
  #5 {"event":"done-admission-rejected","action":"admit-done","source":"system","actingPrincipal":"dev-board-admission","target":"4","transition":"review->done","confirmTokenRef":null,"hardReason":"review-proof-absent","decision":"rejected","timestamp":"2026-07-18T08:00:00.000Z"}
  #6 {"event":"done-admission-rolled-back","action":"admit-done","source":"system","actingPrincipal":"dev-board-admission","target":"6","transition":"review->done","confirmTokenRef":null,"hardReason":"admit-done-atomic-write-failed","decision":"rejected","timestamp":"2026-07-18T08:00:00.000Z"}
  #7 {"event":"command-rejected","action":"move-to-review","source":"autonomous","actingPrincipal":"admin-other","target":"7","transition":"in_progress->review","confirmTokenRef":{"tokenId":"token-2","consumedAt":null},"hardReason":"principal-mismatch","decision":"rejected","timestamp":"2026-07-18T08:00:00.000Z"}
  #8 {"event":"command-rejected","action":"move-to-review","source":"human-commanded","actingPrincipal":"admin-owner","target":"8","transition":"in_progress->review","confirmTokenRef":{"tokenId":"token-3","consumedAt":null},"hardReason":"confirm-token-expired","decision":"rejected","timestamp":"2026-07-18T08:00:01.001Z"}
  #9 {"event":"command-rejected","action":"move-to-review","source":"human-commanded","actingPrincipal":"admin-owner","target":"9","transition":"review->review","confirmTokenRef":{"tokenId":"token-4","consumedAt":"2026-07-18T08:00:01.001Z"},"hardReason":"confirm-token-conflict","decision":"rejected","timestamp":"2026-07-18T08:00:01.001Z"}
  #10 {"event":"command-rejected","action":"move-to-review","source":"autonomous","actingPrincipal":"admin-owner","target":"10","transition":"in_progress->review","confirmTokenRef":null,"hardReason":"confirm-token-invalid","decision":"rejected","timestamp":"2026-07-18T08:00:01.001Z"}
  #11 {"event":"command-rejected","action":"move-to-review","source":"autonomous","actingPrincipal":null,"target":"11","transition":"in_progress->review","confirmTokenRef":{"tokenId":"token-5","consumedAt":null},"hardReason":"principal-binding-absent","decision":"rejected","timestamp":"2026-07-18T08:00:01.001Z"}

SCENARIO_SUMMARY=PASS
```
