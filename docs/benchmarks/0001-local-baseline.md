# 0001: Local Baseline

Date: 2026-06-15
Machine notes: Linux local workspace, Ubuntu 26.04, Node `v24.16.0` initially, Node `v22.22.3` installed through nvm, Corepack `0.34.6` under Node 22, pnpm `10.29.3` through Corepack.
Git commit or source state: non-git workspace after importing upstream Mission Control base into `anito-opzava` and applying Opzava branding/setup cleanup.
Dataset or fixture: imported upstream application plus Opzava governance docs/tests.

## Environment Notes

System `make`, `gcc`, and `g++` are unavailable, and passwordless sudo is unavailable.

Native dependency install uses a user-space toolchain extracted under `/tmp/opencode/build-tools` as documented in `docs/discovery/0002-base-import-and-local-install.md`.

Commands that may rebuild native packages should prepend:

```text
PATH="/tmp/opencode/build-tools/bin:/tmp/opencode/build-tools/root/usr/bin:$PATH"
```

## Commands And Results

### Warm dependency install

Command:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 22 && PATH="/tmp/opencode/build-tools/bin:/tmp/opencode/build-tools/root/usr/bin:$PATH" /usr/bin/time -f 'elapsed=%E user=%U sys=%S maxrss_kb=%M' pnpm install >/dev/null
```

Result:

```text
elapsed=0:00.81 user=0.92 sys=0.14 maxrss_kb=218684
```

### Typecheck

Command:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 22 && /usr/bin/time -f 'elapsed=%E user=%U sys=%S maxrss_kb=%M' pnpm run typecheck >/dev/null
```

Result:

```text
elapsed=0:15.70 user=23.48 sys=1.00 maxrss_kb=1344888
```

### Lint

Command:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 22 && /usr/bin/time -f 'elapsed=%E user=%U sys=%S maxrss_kb=%M' pnpm run lint >/dev/null
```

Result:

```text
elapsed=0:16.87 user=32.20 sys=0.98 maxrss_kb=1134304
```

Lint exits successfully with `0` errors and existing warnings about bare `fetch` usage, hook dependencies, and one unused eslint-disable directive.

### Unit tests

Command:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 22 && /usr/bin/time -f 'elapsed=%E user=%U sys=%S maxrss_kb=%M' pnpm test >/dev/null
```

Result:

```text
elapsed=0:09.06 user=80.78 sys=18.97 maxrss_kb=239360
```

The unsuppressed validation run passed `98` test files and `1078` tests.

### Governance tests

Command:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 22 && /usr/bin/time -f 'elapsed=%E user=%U sys=%S maxrss_kb=%M' node --test test/check-plan.test.mjs test/branding.test.mjs test/project-directory-name.test.mjs test/production-grade-complexity.test.mjs test/code-simplicity.test.mjs test/context.test.mjs test/folder-structure.test.mjs test/opzava-ard.test.mjs >/dev/null
```

Result:

```text
elapsed=0:00.14 user=0.39 sys=0.12 maxrss_kb=64784
```

The unsuppressed validation run passed `18` governance tests after the generated-file gate recognized `next-env.d.ts` and `tsconfig.tsbuildinfo` as generated top-level entries.

### Production build

Command:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 22 && /usr/bin/time -f 'elapsed=%E user=%U sys=%S maxrss_kb=%M' pnpm run build >/dev/null
```

Result:

```text
elapsed=0:34.25 user=135.69 sys=10.83 maxrss_kb=4072128
```

The unsuppressed validation run completed Next.js production build successfully.

## Interpretation

Full app validation is now measured locally. This baseline is suitable for regression comparison during the next Opzava contract and durable-runner slices.

The production build is the heaviest measured command by memory and elapsed time. Unit tests are highly parallel and show high aggregate CPU time relative to wall-clock time.

These numbers are local-machine evidence, not product performance budgets. Future optimization claims require before/after measurements against this baseline or a newer accepted benchmark note.

## Not Yet Measured

- Dev server cold start time.
- Database migration and seed duration as a standalone command.
- Admin config validation duration.
- Mock content workflow duration from intake to approval-blocked WordPress draft step.
- Runner recovery time after simulated process restart.
- Duplicate external-action prevention under retry.
- Anti-slop review duration and rejection rate for a fixture set.

These require the Opzava contract, admin-config, runner, and mocked content workflow layers to exist first.

## Follow-Ups

- Add a project-local bootstrap script for native toolchain setup in unprivileged environments.
- Move TypeScript build info output into an explicit generated/cache path if the root generated files become noisy.
- Record dev server cold start after a stable local run command is accepted.
