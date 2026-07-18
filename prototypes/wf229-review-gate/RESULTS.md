PASS S1 Normal pass path admits Done with matching single-use auth and containment
PASS S2 Changes Requested moves card back to Todo and never Done
PASS S3 Reviewer independence rejects self-review
PASS S4 Stale evidence bound to old contract/sha is invalidated
PASS S5 Fail-closed when reviewer or runner unavailable
PASS S6 Done without matching merge authorization is rejected
PASS S7 Exclusive shared Docker lease rejects concurrent Review attempt
PASS S8 Consumed merge authorization cannot be replayed
PASS S9 Superseded candidate after Pass cannot be admitted Done
PASS S10 Historical rollback candidate promotion is rejected
PASS S11 Expired merge authorization is rejected at admit
PASS S12 Different target confirmation is rejected
PASS S13 Evidence cannot be re-bound once attached to a running attempt
PASS S14 Snapshot clones are isolated and reviewer independence is rechecked at Done
PASS S15 Two harness instances on shared stack cannot both hold lease
PASS S16 Late unavailability at Done causes fail-closed admission

SCENARIO_SUMMARY=PASS
