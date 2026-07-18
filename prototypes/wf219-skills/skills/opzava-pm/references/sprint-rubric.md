# Sprint rubric for opzava-pm

- single-thread rule:
  keep one Card in one active path unless a dependency is provably independent;
- dependency lock:
  if dependency is unresolved for 24h+, do not open new execution scope;
- blocker rule:
  any blocked chain with no owner has critical priority until ownership is set;
- telemetry rule:
  one clear proof source per sprint claim;
- evidence floor:
  every sprint decision must cite task list slice, owner, and proof timestamp.
