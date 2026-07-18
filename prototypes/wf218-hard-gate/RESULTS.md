PASS S1 Autonomous-reject

PASS S2 Human-confirm-accept

PASS S3 Principal-mismatch-reject

PASS S4 Create-with-done-reject

PASS S5 Expired-and-replayed-reject

PASS S6 Forged-token-source

PASS S7 Principal-binding-absent

PASS S8 Malformed-expiry


Audit Log:
  #1. {"action":"move","source":"autonomous","actingPrincipal":"admin X","target":"1","transition":"todo->done","confirmTokenRef":null,"hardReason":"autonomous-attempt-on-gated-transition","decision":"rejected","timestamp":"2026-07-18T07:26:36.728Z"}
  #2. {"action":"move","source":"human-commanded","actingPrincipal":"admin X","target":"2","transition":"in_progress->done","confirmTokenRef":{"tokenId":"token-1","consumedAt":"2026-07-18T07:26:36.730Z"},"hardReason":null,"decision":"allowed","timestamp":"2026-07-18T07:26:36.730Z"}
  #3. {"action":"move","source":"autonomous","actingPrincipal":"admin B","target":"3","transition":"in_progress->done","confirmTokenRef":{"tokenId":"token-2","consumedAt":null},"hardReason":"principal-mismatch","decision":"rejected","timestamp":"2026-07-18T07:26:36.730Z"}
  #4. {"action":"create","source":"autonomous","actingPrincipal":"admin X","target":null,"transition":"none->done","confirmTokenRef":null,"hardReason":"create-with-terminal-status","decision":"rejected","timestamp":"2026-07-18T07:26:36.730Z"}
  #5. {"action":"move","source":"human-commanded","actingPrincipal":"admin X","target":"4","transition":"in_progress->done","confirmTokenRef":{"tokenId":"token-3","consumedAt":null},"hardReason":"confirm-token-expired","decision":"rejected","timestamp":"2026-07-18T07:26:36.730Z"}
  #6. {"action":"move","source":"human-commanded","actingPrincipal":"admin X","target":"5","transition":"todo->done","confirmTokenRef":{"tokenId":"token-4","consumedAt":"2026-07-18T07:26:36.730Z"},"hardReason":null,"decision":"allowed","timestamp":"2026-07-18T07:26:36.730Z"}
  #7. {"action":"move","source":"human-commanded","actingPrincipal":"admin X","target":"5","transition":"done->done","confirmTokenRef":{"tokenId":"token-4","consumedAt":"2026-07-18T07:26:36.730Z"},"hardReason":"confirm-token-conflict","decision":"rejected","timestamp":"2026-07-18T07:26:36.730Z"}
  #8. {"action":"move","source":"autonomous","actingPrincipal":"admin X","target":"6","transition":"in_progress->done","confirmTokenRef":null,"hardReason":"autonomous-attempt-on-gated-transition","decision":"rejected","timestamp":"2026-07-18T07:26:36.731Z"}
  #9. {"action":"move","source":"autonomous","target":"7","transition":"todo->done","confirmTokenRef":{"tokenId":"token-5","consumedAt":null},"hardReason":"principal-binding-absent","decision":"rejected","timestamp":"2026-07-18T07:26:36.731Z"}
  #10. {"action":"move","source":"autonomous","target":"8","transition":"todo->done","confirmTokenRef":{"tokenId":"token-6","consumedAt":null},"hardReason":"principal-binding-absent","decision":"rejected","timestamp":"2026-07-18T07:26:36.731Z"}
  #11. {"action":"move","source":"human-commanded","actingPrincipal":"admin X","target":"9","transition":"in_progress->done","confirmTokenRef":{"tokenId":"token-7","consumedAt":null},"hardReason":"confirm-token-expired","decision":"rejected","timestamp":"2026-07-18T07:26:36.731Z"}

SCENARIO_SUMMARY=PASS
exit=0
