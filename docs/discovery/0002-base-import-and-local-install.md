# 0002: Base Import And Local Install

Date: 2026-06-15
Status: CONFIRMED
Related plan: `docs/plans/opzava-start-plan.md`
Related architecture: `docs/architecture/folder-structure.md`

## Question

Can the real upstream Mission Control base be imported locally and prepared for Opzava implementation?

## Context

The workspace initially contained only Opzava governance docs and Node validation tests. The upstream base was already cloned for discovery at `/tmp/opencode/mission-control` from `https://github.com/builderz-labs/mission-control`.

## Local Experiment

Imported upstream files into `/home/anthony/devtony/anito-opzava` with:

```text
rsync -a --ignore-existing --exclude='.git/' --exclude='.env*' /tmp/opencode/mission-control/ /home/anthony/devtony/anito-opzava/
```

The import intentionally excluded `.git/` and `.env*` files and preserved existing Opzava governance docs/tests.

Checked runtime/tooling:

```text
node -v
pnpm -v
corepack --version
corepack pnpm -v
```

Installed Node 22 through nvm because the imported project pins Node 22 in `.nvmrc` and `.node-version`:

```text
source "$HOME/.nvm/nvm.sh" && nvm install 22
```

Attempted dependency install under Node 24 and Node 22:

```text
corepack pnpm install
source "$HOME/.nvm/nvm.sh" && nvm use 22 && corepack pnpm install
```

Resolved the local environment blockers with:

```text
source "$HOME/.nvm/nvm.sh" && nvm use 22 && corepack enable pnpm
mkdir -p "/tmp/opencode/build-tools/debs" "/tmp/opencode/build-tools/root"
apt-get download make gcc g++ gcc-15 g++-15 cpp-15 libstdc++-15-dev libgcc-15-dev gcc-15-x86-64-linux-gnu g++-15-x86-64-linux-gnu cpp-15-x86-64-linux-gnu
dpkg-deb -x <downloaded-deb> /tmp/opencode/build-tools/root
PATH="/tmp/opencode/build-tools/bin:/tmp/opencode/build-tools/root/usr/bin:$PATH" pnpm install
```

The user-space compiler wrappers live under `/tmp/opencode/build-tools/bin` and point GCC at the extracted private compiler/runtime paths. This avoids changing system packages or global git/npm configuration.

## Measurements

- Initial local Node: `v24.16.0`.
- Project-pinned Node: `22` from `.nvmrc` and `.node-version`.
- Installed Node 22: `v22.22.3`.
- Corepack under Node 22: `0.34.6`.
- Pinned pnpm through Corepack: `10.29.3`.
- `pnpm` was not directly on PATH until `corepack enable pnpm` created the Node 22 shim.
- System `make`, `gcc`, and `g++` are not installed.
- Passwordless sudo is not available, so system package installation is not possible from this session.
- User-space extracted Ubuntu packages provide local `make`, `gcc`, and `g++` under `/tmp/opencode/build-tools`.
- `node-pty@1.1.0` builds successfully when the local toolchain is prepended to `PATH`.
- Governance validation passes after import and branding cleanup: `18 passed`.
- `pnpm run verify:node` passes under Node 22.
- `pnpm install` passes under Node 22 with the local toolchain.
- `pnpm run lint` exits successfully with existing warnings.
- `pnpm run typecheck` passes.
- `pnpm test` passes: `98` test files, `1078` tests.
- `pnpm run build` passes.

## Findings

- The upstream Mission Control base is now present in the Opzava workspace.
- Existing Opzava governance files were preserved.
- `.env*` files were not imported.
- Dependency installation was blocked by native dependency build tooling until the user-space toolchain was extracted.
- `node-pty@1.1.0` does not find a usable prebuild in this environment and falls back to `node-gyp rebuild`.
- `node-gyp rebuild` fails without `make`, `gcc`, and `g++`, but succeeds with the local wrappers first on `PATH`.
- Installing Node 22 did not avoid the `node-pty` rebuild path.
- GNAP sync tests also required scoped git author/committer identity because the host has no global git identity. `src/lib/gnap-sync.ts` now supplies Opzava defaults only to child git processes.
- Full app validation is now unblocked locally.

## Decision

Use Node 22 with the Corepack-provided `pnpm` shim. In this unprivileged environment, prepend `/tmp/opencode/build-tools/bin:/tmp/opencode/build-tools/root/usr/bin` to `PATH` when native rebuilds are needed.

Do not bypass install scripts for production validation, because native packages such as `node-pty` and `better-sqlite3` are runtime-relevant.

## Follow-Ups

- Consider adding a project-local bootstrap script for unprivileged environments that need native rebuilds without sudo.
- Consider making TypeScript build info output location explicit so generated `tsconfig.tsbuildinfo` does not appear at repo root.
