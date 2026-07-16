# Upstream pin (tracked fork — ADR-016)

| Field | Value |
| --- | --- |
| Upstream | https://github.com/openclaw/openclaw |
| Version | `v2026.6.11` (`package.json` 2026.6.11) |
| Commit | `bd2740fedc` — "fix(slack): preserve time colons in interactive labels (#99877)" |
| Imported | 2026-07-04 (squash import: working tree only, upstream `.git` dropped) |
| License | MIT (see `LICENSE`) |

## Upstream bump procedure (deliberate operation, never an image-tag change)

1. Scratch-clone upstream outside this repo; `git diff <this-pin>..<new-tag>`.
2. Review the diff against `PATCHES.md`. **All five entries are rung-3** — they patch upstream files,
   so every one must re-apply or be upstreamed/retired, not just the one that looks riskiest. Check
   each patched file still exists and measure its upstream churn before applying anything.
3. Apply the new working tree here, update this file's pin, and rebuild the image.
4. Prove it before committing:
   - **Provider connect still works.** Patch 3 (`onboard --credential-stdin`) is not upstreamed; an
     image built without it fails closed with `provisioning.connections.onboardCredentialStdinUnsupported`,
     because the worker checks `onboard --help` before handing over the secret and never falls back to
     argv. Drive `tests/e2e/drives/connections-apikey-argv.mjs` (it also proves the canary reaches
     neither `/proc/*/cmdline` nor `/proc/*/environ`).
   - **The broker and worker reconnect** to the rebuilt gateway.
   - Drive whatever else the bump touched on the real local stack per the verify posture
     (`CLAUDE.md` → "Working here", `CONTEXT.md` → "Real-world validation"): the `/verify` skill plus
     the `tests/e2e/` drives, observing the exact changed behavior. The old blocking
     `real-world-validate.mjs` gate this step used to name was retired in the 2026-07-16 focus
     cleanup — the script, its runbooks, and its npm scripts are gone.
5. Never `pnpm install`/build artifacts get committed — the Docker build owns that.
