# wf216 delegation prototype run

Executed from `/home/soultransit/devtony/opzava/.claude/worktrees/wf216-219-grilling-prototypes`:

```text
PASS S1
PASS S2
PASS S3
PASS S4
PASS S5
PASS S6
PASS S7
PASS S8
PASS S9
PASS S10
PASS S11

=== Delegation Cards ===
  card-1 S1 delegation happy path
    state=submitted_for_review expectedVersion=3 executionUnknown=false
    lastCheckpoint={"id":"checkpoint-2","cardId":"card-1","at":"2026-07-18T10:00:00.000Z","note":"checkpoint-2"}
    principal=admin-A source=web-chat
    checkpoints=2 lastTwo=checkpoint-1,checkpoint-2
  card-2 S3 disconnect containment
    state=in_progress expectedVersion=4 executionUnknown=false
    lastCheckpoint={"id":"checkpoint-3","cardId":"card-2","at":"2026-07-18T10:00:00.000Z","note":"s3-checkpoint-before-disconnect"}
    principal=admin-B source=web-chat
    checkpoints=1 lastTwo=checkpoint-3
  card-3 S4 reauth mismatch
    state=requested expectedVersion=1 executionUnknown=false
    lastCheckpoint=null
    principal=admin-C source=web-chat
  card-4 S5 replay dedupe
    state=in_progress expectedVersion=2 executionUnknown=false
    lastCheckpoint=null
    principal=admin-D source=web-chat
  card-5 S7 stale-version resume
    state=in_progress expectedVersion=4 executionUnknown=false
    lastCheckpoint={"id":"checkpoint-4","cardId":"card-5","at":"2026-07-18T10:00:00.000Z","note":"s7-checkpoint-before-disconnect"}
    principal=admin-E source=web-chat
    checkpoints=1 lastTwo=checkpoint-4
  card-6 S8 cross-caller replay
    state=requested expectedVersion=2 executionUnknown=false
    lastCheckpoint=null
    principal=admin-H source=web-chat
  card-7 S9 old-fence writes
    state=in_progress expectedVersion=4 executionUnknown=false
    lastCheckpoint={"id":"checkpoint-6","cardId":"card-7","at":"2026-07-18T10:00:00.000Z","note":"s9-fresh-checkpoint"}
    principal=admin-I source=web-chat
    checkpoints=2 lastTwo=checkpoint-5,checkpoint-6
  card-8 S10 resume-nonce-reuse
    state=in_progress expectedVersion=4 executionUnknown=false
    lastCheckpoint=null
    principal=admin-F source=web-chat
  card-9 S11 delayed-old-lease-event
    state=blocked expectedVersion=5 executionUnknown=true
    lastCheckpoint={"id":"checkpoint-7","cardId":"card-9","at":"2026-07-18T10:00:00.000Z","note":"s11-live-checkpoint"}
    principal=admin-G source=web-chat
    checkpoints=1 lastTwo=checkpoint-7

=== Leases ===
  lease-1 card=card-1 fence=fence-fence-1 nonce=s1-claim
  lease-2 card=card-2 fence=fence-fence-2 nonce=s3-claim
  lease-3 card=card-2 fence=fence-fence-3 nonce=s3-resume
  lease-4 card=card-4 fence=fence-fence-4 nonce=s5-identical-nonce
  lease-5 card=card-5 fence=fence-fence-5 nonce=s7-claim
  lease-6 card=card-5 fence=fence-fence-6 nonce=s7-resume-fresh
  lease-7 card=card-7 fence=fence-fence-7 nonce=s9-claim
  lease-8 card=card-7 fence=fence-fence-8 nonce=s9-resume
  lease-9 card=card-8 fence=fence-fence-9 nonce=s10-claim
  lease-10 card=card-8 fence=fence-fence-10 nonce=s10-resume
  lease-11 card=card-9 fence=fence-fence-11 nonce=s11-claim
  lease-12 card=card-9 fence=fence-fence-12 nonce=s11-resume

=== Audit sample (first 40) ===
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-1","action":"requestCreateBacklogDevTicket","actorRef":"admin-A","source":"web-chat"}
  card.seeded :: {"ts":"2026-07-18T10:00:00.000Z","type":"card.seeded","cardId":"card-1","principalRef":"admin-A","sourceRef":"web-chat","expectedVersion":1}
  ask-admin.dispatched :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.dispatched","commandRef":"command-1","action":"requestCreateBacklogDevTicket","actorRef":"admin-A","source":"web-chat","result":"card-created"}
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-2","action":"requestClaimAndStart","actorRef":"admin-A","source":"web-chat","target":"card-1","expectedVersion":1}
  runner.start-receipt :: {"ts":"2026-07-18T10:00:00.000Z","type":"runner.start-receipt","cardId":"card-1","leaseId":"lease-1","receiptId":"receipt-1","signature":"sig-05281597","commandRef":"command-2","actorRef":"admin-A"}
  executionAdmission.claim-approved :: {"ts":"2026-07-18T10:00:00.000Z","type":"executionAdmission.claim-approved","cardId":"card-1","leaseId":"lease-1","versionBefore":1,"versionAfter":2,"commandRef":"command-2"}
  ask-admin.dispatched :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.dispatched","commandRef":"command-2","action":"requestClaimAndStart","target":"card-1","actorRef":"admin-A","source":"web-chat","result":"accepted"}
  runner.checkpoint :: {"ts":"2026-07-18T10:00:00.000Z","type":"runner.checkpoint","cardId":"card-1","checkpointId":"checkpoint-1","note":"checkpoint-1","state":"in_progress","leaseId":"lease-1","fence":"fence-fence-1","nonce":"s1-claim"}
  runner.checkpoint :: {"ts":"2026-07-18T10:00:00.000Z","type":"runner.checkpoint","cardId":"card-1","checkpointId":"checkpoint-2","note":"checkpoint-2","state":"in_progress","leaseId":"lease-1","fence":"fence-fence-1","nonce":"s1-claim"}
  runner.worklog :: {"ts":"2026-07-18T10:00:00.000Z","type":"runner.worklog","cardId":"card-1","line":"worker: implemented tests and proofs","leaseId":"lease-1","fence":"fence-fence-1","nonce":"s1-claim"}
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-3","action":"requestSubmitForReview","actorRef":"admin-A","source":"web-chat","target":"card-1","expectedVersion":2}
  devboard.submitted-for-review :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.submitted-for-review","cardId":"card-1","commandRef":"command-3"}
  ask-admin.dispatched :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.dispatched","commandRef":"command-3","action":"requestSubmitForReview","target":"card-1","actorRef":"admin-A","source":"web-chat","result":"submitted_for_review"}
  ask-admin.rejected :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.rejected","action":"Done","reason":"forbidden-verb","actorRef":"admin-A","commandNonce":"s2-forbidden"}
  card.seeded :: {"ts":"2026-07-18T10:00:00.000Z","type":"card.seeded","cardId":"card-2","principalRef":"admin-B","sourceRef":"web-chat","expectedVersion":1}
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-4","action":"requestClaimAndStart","actorRef":"admin-B","source":"web-chat","target":"card-2","expectedVersion":1}
  runner.start-receipt :: {"ts":"2026-07-18T10:00:00.000Z","type":"runner.start-receipt","cardId":"card-2","leaseId":"lease-2","receiptId":"receipt-2","signature":"sig-1520fd75","commandRef":"command-4","actorRef":"admin-B"}
  executionAdmission.claim-approved :: {"ts":"2026-07-18T10:00:00.000Z","type":"executionAdmission.claim-approved","cardId":"card-2","leaseId":"lease-2","versionBefore":1,"versionAfter":2,"commandRef":"command-4"}
  ask-admin.dispatched :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.dispatched","commandRef":"command-4","action":"requestClaimAndStart","target":"card-2","actorRef":"admin-B","source":"web-chat","result":"accepted"}
  runner.checkpoint :: {"ts":"2026-07-18T10:00:00.000Z","type":"runner.checkpoint","cardId":"card-2","checkpointId":"checkpoint-3","note":"s3-checkpoint-before-disconnect","state":"in_progress","leaseId":"lease-2","fence":"fence-fence-2","nonce":"s3-claim"}
  runner.disconnect :: {"ts":"2026-07-18T10:00:00.000Z","type":"runner.disconnect","cardId":"card-2","stateFrom":"in_progress","stateTo":"blocked","versionBefore":2,"versionAfter":3,"lastCheckpoint":{"id":"checkpoint-3","cardId":"card-2","at":"2026-07-18T10:00:00.000Z","note":"s3-checkpoint-before-disconnect"},"leaseLost":"lease-2"}
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-5","action":"requestSubmitForReview","actorRef":"admin-B","source":"web-chat","target":"card-2","expectedVersion":3}
  devboard.rejected :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.rejected","commandRef":"command-5","action":"requestSubmitForReview","reason":"resume-required-before-submit","target":"card-2","actorRef":"admin-B"}
  ask-admin.dispatched :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.dispatched","commandRef":"command-5","action":"requestSubmitForReview","target":"card-2","actorRef":"admin-B","source":"web-chat","result":"rejected"}
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-6","action":"requestClaimAndStart","actorRef":"admin-B","source":"web-chat","target":"card-2","expectedVersion":3}
  runner.start-receipt :: {"ts":"2026-07-18T10:00:00.000Z","type":"runner.start-receipt","cardId":"card-2","leaseId":"lease-3","receiptId":"receipt-3","signature":"sig-4a3995f3","commandRef":"command-6","actorRef":"admin-B"}
  executionAdmission.claim-approved :: {"ts":"2026-07-18T10:00:00.000Z","type":"executionAdmission.claim-approved","cardId":"card-2","leaseId":"lease-3","versionBefore":3,"versionAfter":4,"commandRef":"command-6"}
  ask-admin.dispatched :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.dispatched","commandRef":"command-6","action":"requestClaimAndStart","target":"card-2","actorRef":"admin-B","source":"web-chat","result":"accepted"}
  card.seeded :: {"ts":"2026-07-18T10:00:00.000Z","type":"card.seeded","cardId":"card-3","principalRef":"admin-C","sourceRef":"web-chat","expectedVersion":1}
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-7","action":"requestClaimAndStart","actorRef":"admin-C","source":"web-chat","target":"card-3","expectedVersion":2}
  devboard.rejected :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.rejected","commandRef":"command-7","action":"requestClaimAndStart","reason":"expectedVersion-mismatch","target":"card-3","actorRef":"admin-C"}
  ask-admin.dispatched :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.dispatched","commandRef":"command-7","action":"requestClaimAndStart","target":"card-3","actorRef":"admin-C","source":"web-chat","result":"rejected"}
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-8","action":"requestClaimAndStart","actorRef":"admin-Z","source":"web-chat","target":"card-3","expectedVersion":1}
  devboard.rejected :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.rejected","commandRef":"command-8","action":"requestClaimAndStart","reason":"principal-mismatch","target":"card-3","actorRef":"admin-Z"}
  ask-admin.dispatched :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.dispatched","commandRef":"command-8","action":"requestClaimAndStart","target":"card-3","actorRef":"admin-Z","source":"web-chat","result":"rejected"}
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-9","action":"requestClaimAndStart","actorRef":"admin-C","source":"slack-chat","target":"card-3","expectedVersion":1}
  devboard.rejected :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.rejected","commandRef":"command-9","action":"requestClaimAndStart","reason":"source-mismatch","target":"card-3","actorRef":"admin-C"}
  ask-admin.dispatched :: {"ts":"2026-07-18T10:00:00.000Z","type":"ask-admin.dispatched","commandRef":"command-9","action":"requestClaimAndStart","target":"card-3","actorRef":"admin-C","source":"slack-chat","result":"rejected"}
  card.seeded :: {"ts":"2026-07-18T10:00:00.000Z","type":"card.seeded","cardId":"card-4","principalRef":"admin-D","sourceRef":"web-chat","expectedVersion":1}
  devboard.request :: {"ts":"2026-07-18T10:00:00.000Z","type":"devboard.request","commandRef":"command-10","action":"requestClaimAndStart","actorRef":"admin-D","source":"web-chat","target":"card-4","expectedVersion":1}

SCENARIO_SUMMARY=PASS
```
