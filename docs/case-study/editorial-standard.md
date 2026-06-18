# Case Study Editorial Standard

The Opzava case study should entice and wow the audience by showing how a serious automation tool is built under real constraints.

The writing should feel like a build journal for people who care about automation, AI agents, reliability, and product taste. It should not read like a commit log.

## Audience

Primary audience:

- Operators who want AI automation but distrust fragile agent demos.
- Builders who want to see how durable workflow systems are designed.
- Potential users who want confidence that Opzava is not a toy automation layer.
- Technical founders who understand that the hard part is not calling an LLM; the hard part is state, approvals, failures, provenance, and safety.

## Voice

- Direct, confident, and concrete.
- Make the work feel consequential.
- Explain technical choices in plain language without dumbing them down.
- Use tension: what could go wrong, what shortcut was tempting, what we chose instead.
- Prefer vivid specifics over generic claims.

## Evidence Required

Every case-study entry must cite repo evidence such as:

- Files added or changed.
- Tests that failed first and passed after implementation.
- Validation commands and results.
- Discovery notes or benchmarks.
- Architecture rules that constrained the decision.

Do not claim a capability is built unless code, tests, and validation prove it.

## Audience Wow Requirements

Every entry should include at least one audience-facing insight:

- A surprising constraint that made the product stronger.
- A common automation failure mode Opzava is designed to avoid.
- A before-and-after framing that shows why the build got safer.
- A concrete example of how this foundation prevents future chaos.

Good line shape:

```text
Most automation tools show the happy path first. We started by making the unhappy paths explicit.
```

Weak line shape:

```text
We added schemas and tests.
```

## Stakes vs. Speculation

High-stakes framing is allowed. Speculation is not.

Writers may say why a decision matters, what failure mode it prevents, and what future capability it prepares. Writers must not claim that Opzava already solves a future workflow unless that workflow is implemented and validated.

Use this test for every dramatic claim:

- If the sentence says Opzava can do something now, the evidence section must prove it.
- If the sentence says this prepares Opzava for something later, say `prepares`, `blocks a failure mode`, or `sets up`, not `delivers`.
- If the sentence compares Opzava to common automation tools, describe the failure pattern without pretending to have performed a formal competitor benchmark.

## Industry Counterfactual

Every entry must include an `Industry Counterfactual` section.

The counterfactual answers:

- What would a typical fragile automation demo do here?
- What failure would that create later?
- What did Opzava do instead?
- What repo evidence proves the difference?

This is where the content earns its audience impact. The point is not to insult other tools. The point is to show why Opzava is being built with a different level of operational seriousness.

## Anti-Slop Rules

- No vague praise like “robust,” “powerful,” or “seamless” unless the paragraph proves it.
- No fictional users, fictional scale, fictional performance, or fictional revenue.
- No “AI magic” framing. Explain the system design.
- No generic startup narrative. The story is the disciplined build of Opzava.
- No filler sections that do not teach, prove, or create anticipation.

## Secret Redaction

Case-study content must never include:

- API keys, tokens, passwords, cookies, or secret references that reveal ids/purposes.
- `.env` values or local operator secrets.
- Private endpoints unless intentionally public and documented.
- Raw logs that contain credentials or sensitive local paths beyond repo-relative evidence.

Use safe descriptions like `fake provider credential`, `SecretReference`, or `redacted token`.

## Review Checklist

- The hook makes the reader want to continue.
- The stakes explain why the work matters.
- The evidence is concrete and reproducible.
- The entry avoids invented outcomes.
- The entry teaches an automation-system lesson.
- The entry makes Opzava feel more credible after reading it.
