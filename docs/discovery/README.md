# Discovery Notes

Discovery notes capture local R&D before implementation decisions are treated as settled.

Use this directory for audits, blocker investigations, experiments, and evidence gathered from the local codebase.

## Required Format

```text
# 000N: Title

Date:
Author:
Related plan:
Related ARD:

## Question

What decision or blocker is being investigated?

## Context

What is known before the experiment starts?

## Options

What approaches are being compared?

## Local Experiment

What commands, code paths, fixtures, or datasets were used?

## Measurements

What was measured? Include commands, durations, counts, logs, errors, and environment notes.

## Findings

What did the experiment prove, disprove, or leave unresolved?

## Decision

What will be done next? Link an ARD if the decision affects architecture.

## Follow-Ups

What must be tested, benchmarked, removed, or revisited?
```

## Rules

- Do not replace local measurements with guesses.
- Do not hide blockers in implementation notes.
- Do not make architecture decisions from undocumented experiments.
- Do not commit secrets, tokens, or environment files as discovery evidence.
- Do not treat generated content as source-backed without captured provenance.
- Do not record cleartext API keys, tokens, passwords, or secret-bearing payloads.
