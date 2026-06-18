# ARD 0001: Use Mission Control As The Opzava Base

Status: Accepted
Date: 2026-06-15

## Project Identity

Full brand name: `Opzava`

Machine slug: `opzava`

Local directory name: `anito-opzava`

Project repository: `https://github.com/anthonykewl20/opzava`

The repository is private. It was confirmed with the authenticated GitHub CLI account `anthonykewl20` using `gh repo view anthonykewl20/opzava --json name,owner,url,visibility,defaultBranchRef`.

## Context

Opzava needs a self-hosted operations control plane for an AI operating team. The system is not only for generating high-quality blog content. It must also support SEO research, content writing, review, lead research, cold outreach, campaign operations, approvals, audit trails, costs, and future team functions.

The upstream project `builderz-labs/mission-control` was verified from the public GitHub repository, README, and package manifest on 2026-06-15.

Confirmed upstream facts:

- Repository: `https://github.com/builderz-labs/mission-control`
- License: MIT
- Stack: Next.js, React, TypeScript, pnpm, SQLite
- Purpose: AI agent orchestration dashboard with tasks, agents, quality gates, scheduler, webhooks, costs, and security panels
- Risk: alpha software that needs hardening before production dependence

## Decision

Use `builderz-labs/mission-control` as the base project, then fork and customize it into a heavily customized `Opzava` product in the private `anthonykewl20/opzava` repository.

The upstream Mission Control base gives us the operator control plane. Opzava-specific code gives us the durable team and workflow engine.

The product identity is `Opzava`, not `Mission Control` or `Anito Content OS`.
