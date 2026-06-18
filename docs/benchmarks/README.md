# Benchmarks

Benchmarks capture reproducible local measurements for `opzava` development.

The first benchmark must measure the base Opzava app before major custom architecture changes. Later benchmarks compare against that baseline.

## Required Format

```text
# 000N: Benchmark Title

Date:
Machine notes:
Git commit or source state:
Dataset or fixture:

## Command

Exact command run.

## Result

Raw result, duration, counts, memory notes, or logs.

## Interpretation

What the result means and whether it is a baseline, regression, improvement, or inconclusive.

## Follow-Ups

What needs to be measured again and under what conditions?
```

## Initial Measurements

- Dependency install duration.
- Dev server cold start duration.
- Production build duration.
- Test suite duration.
- Typecheck duration.
- Lint duration.
- Database migration and seed duration.
- Mock content workflow duration.
- Runner restart recovery duration.
- Duplicate external-action prevention under retry.
- Admin config validation duration.
- Anti-slop review duration and rejection rate for a fixture set.

## Rules

- Measure before optimizing.
- Include the exact command and dataset.
- Mark results inconclusive when the environment or fixture is unstable.
- Compare future results to recorded baseline files, not memory.
- Never include cleartext secrets in benchmark files.
