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
2. Review the diff against `PATCHES.md` (rung-3 patches must re-apply or be upstreamed/retired).
3. Apply the new working tree here, update this file's pin, rebuild the image, and run the FULL
   real-world-validation gate plus broker/worker reconnect proof before committing.
4. Never `pnpm install`/build artifacts get committed — the Docker build owns that.
