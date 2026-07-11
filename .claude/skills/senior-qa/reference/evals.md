# Evaluating the senior-qa skill

Eval-driven iteration keeps this skill triggering correctly and behaving well. Test cases live in [../evals/evals.json](../evals/evals.json).

## Run each case twice

Run every case with the skill and without it (baseline), each in a clean context (a fresh subagent or session), and compare:

- **Trigger:** did the agent load `SKILL.md` when it should (and stay away when it should not)?
- **Behavior:** does the with-skill run honor the hard rules (real stack, real login, exit-code verdict) that the baseline misses?

## Grade against assertions

For each case, grade every assertion PASS/FAIL with concrete evidence quoted from the run. Prefer script checks for mechanical assertions (exit code observed, no minted cookie used); reserve human review for qualities assertions cannot capture. The skill earns its keep on assertions that pass with it and fail without it.

## Iterate

Feed failed assertions + the run transcript + the current `SKILL.md` back in, propose lean edits (fewer, better instructions beat more rules; explain the why), then re-run. Stop when results plateau or reviewer feedback is consistently empty.
