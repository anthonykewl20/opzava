# Anito Opzava Full-Removal Consensus

Status: dry-run plan only. No Docker mutation was executed while producing this artifact.

Target to remove: the old `anito-opzava` Compose project from
`/home/anthony/devtony/anito-opzava`.

Target to preserve: the real Opzava stack in `/home/anthony/devtony/opzava`, Compose project
`opzava`, plus unrelated projects `cavpm`, `kainquest`, and `vdvip`.

Docker socket note: this plan reasons from the supplied host state and the current Opzava repo
Compose contract. The sandbox used to write this document was not used to inspect or mutate the
host Docker daemon.

## 1. Disjointness Proof

### Project boundary

| Set | Compose project | Repo path | Decision |
| --- | --- | --- | --- |
| Remove | `anito-opzava` | `/home/anthony/devtony/anito-opzava` | Remove entirely. |
| Preserve | `opzava` | `/home/anthony/devtony/opzava` | Do not touch. |
| Preserve | `cavpm`, `kainquest`, `vdvip` | not part of this repo | Do not touch. |

The removal commands below use `docker compose -p anito-opzava` or exact
`anito-opzava_*` resource names. They never use `docker compose -p opzava`, `docker compose down`
from the real Opzava repo, `docker system prune`, `docker volume prune`, or `docker network prune`.

### Container names

Remove containers supplied for the old stack:

```text
opzava-dokploy-traefik
opzava-dokploy-openclaw-gateway
anito-opzava-mission-control-1
```

Preserve containers supplied for the real Opzava stack:

```text
opzava-web-1
opzava-postgres-1
opzava-gateway-broker-1
opzava-provisioning-worker-1
opzava-openclaw-platform-gateway-1
opzava-minio-1
opzava-minio-bucket-init-1
opzava-traefik-1
opzava-docker-socket-proxy-1
```

Proof: there are no exact container-name matches. The remove set contains two
`opzava-dokploy-*` legacy names and one `anito-opzava-*` name; the preserve set contains only
`opzava-*` Compose names from project `opzava`. The supplied preserve list says "8 containers" but
enumerates 9 names; treat all 9 listed names as protected. `opzava-minio-bucket-init-1` may be an
exited one-shot container and is still protected.

### Network names

| Remove network | Preserve network | Overlap |
| --- | --- | --- |
| `anito-opzava_dokploy-network` | `dokploy-network` | None. |

Proof: `anito-opzava_dokploy-network` is a project-scoped network name from the old project.
`dokploy-network` is the shared external network named in `CONTEXT.md`, `README.md`, and the real
`docker-compose.yml` as the Opzava local/Dokploy parity network. The removal plan removes only the
project-scoped network and explicitly verifies that `dokploy-network` still exists afterward.

### Volume names

Remove volumes supplied for the old stack:

```text
anito-opzava_mc-data
anito-opzava_mc-dokploy-data
anito-opzava_openclaw-data
anito-opzava_openclaw-dokploy-data
```

Preserve volumes supplied for the real Opzava stack:

```text
opzava-pgdata
opzava-minio-data
openclaw-platform-config
openclaw-platform-workspace
openclaw-platform-auth-profiles
```

Proof: there are no exact volume-name matches. Every remove volume is prefixed
`anito-opzava_`; the protected Opzava durable volumes are `opzava-*` or
`openclaw-platform-*`.

### Image references and image IDs

Remove images supplied for the old stack:

```text
anito-opzava-mission-control:latest
opzava-dokploy-local:latest
af7ea052cf21
traefik:v3.7.5
```

Preserve images supplied or found in the real Opzava Compose contract:

```text
opzava/mainframe-gateway:2026.6.11
opzava-* service images built for web, gateway-broker, provisioning-worker, and related services
traefik:v3.6.1
postgres:18.4-bookworm
quay.io/minio/minio:<configured tag>
quay.io/minio/mc:<configured tag>
tecnativa/docker-socket-proxy:<configured tag>
```

Proof by repo contract:

- The real Opzava `docker-compose.yml` pins local Traefik to `traefik:v3.6.1`, not
  `traefik:v3.7.5`.
- The real Platform Gateway image is `opzava/mainframe-gateway:2026.6.11`, built from
  `./mainframe`; it is not `opzava-dokploy-local:latest` or the untagged image
  `af7ea052cf21`.
- A repo search for `traefik:v3.7.5`, `anito-opzava`, `opzava-dokploy`, and `af7ea052cf21` found no
  current Opzava source reference to those remove-set image refs. The only matches for
  `dokploy-network` and `openclaw-platform` are the real Opzava deployment docs and compose file.

Flag: `traefik:v3.7.5` is safe to remove only under the supplied host fact that only
`anito-opzava` consumes it. Because images are global Docker objects, the operator must run the
read-only preflight below before mutation. If any preserve or other project references
`traefik:v3.7.5`, `anito-opzava-mission-control:latest`, `opzava-dokploy-local:latest`, or image ID
`af7ea052cf21`, stop and do not remove that image.

## 2. Preflight Guards Before Any Mutation

Run from any directory. These commands are read-only.

```bash
docker ps -a \
  --filter label=com.docker.compose.project=anito-opzava \
  --format 'anito container: {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.ID}}'
```

Expected effect: lists exactly the old project containers:
`opzava-dokploy-traefik`, `opzava-dokploy-openclaw-gateway`, and
`anito-opzava-mission-control-1`. If it lists anything else, stop and review.

```bash
docker ps -a \
  --filter label=com.docker.compose.project=opzava \
  --format 'opzava container: {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.ID}}'
```

Expected effect: lists the protected real Opzava containers. This establishes the preserve baseline
before removal.

```bash
docker ps -a \
  --filter ancestor=traefik:v3.7.5 \
  --format 'traefik:v3.7.5 consumer: {{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Status}}'
docker ps -a \
  --filter ancestor=anito-opzava-mission-control:latest \
  --format 'mission-control image consumer: {{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Status}}'
docker ps -a \
  --filter ancestor=opzava-dokploy-local:latest \
  --format 'opzava-dokploy-local image consumer: {{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Status}}'
docker ps -a \
  --filter ancestor=af7ea052cf21 \
  --format 'af7ea052cf21 consumer: {{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Status}}'
```

Expected effect: every consumer shown for these remove-set images belongs to project
`anito-opzava`. If any line shows `opzava`, `cavpm`, `kainquest`, `vdvip`, or a blank/unknown
project that still matters, stop and exclude that image from `docker rmi`.

```bash
docker network inspect anito-opzava_dokploy-network \
  --format 'remove network: {{.Name}} containers={{len .Containers}}'
docker network inspect dokploy-network \
  --format 'preserve network: {{.Name}} containers={{len .Containers}}'
```

Expected effect: both networks exist before removal. Only the first one is targeted.

```bash
docker volume inspect \
  anito-opzava_mc-data \
  anito-opzava_mc-dokploy-data \
  anito-opzava_openclaw-data \
  anito-opzava_openclaw-dokploy-data \
  --format 'remove volume: {{.Name}}'
docker volume inspect \
  opzava-pgdata \
  opzava-minio-data \
  openclaw-platform-config \
  openclaw-platform-workspace \
  openclaw-platform-auth-profiles \
  --format 'preserve volume: {{.Name}}'
```

Expected effect: confirms exact remove and preserve volume names before any destructive volume
operation. If the real Opzava volumes are project-prefixed on the host, use
`docker volume ls --filter label=com.docker.compose.project=opzava` to establish the equivalent
protected names and do not remove them.

## 3. Exact Ordered Command Sequence For Full Removal

Do not run these until the preflight guards above pass.

### Step 1: enter the old stack directory

```bash
cd /home/anthony/devtony/anito-opzava
```

Expected effect: positions `docker compose` on the old stack's compose file. Do not run this from
`/home/anthony/devtony/opzava`.

### Step 2: stop and remove the old Compose project, including declared volumes

```bash
docker compose -p anito-opzava down --volumes --remove-orphans --timeout 30
```

Expected effect:

- Stops and removes containers in project `anito-opzava`, including the supplied running containers
  `opzava-dokploy-traefik`, `opzava-dokploy-openclaw-gateway`, and
  `anito-opzava-mission-control-1`.
- Removes non-external networks declared by that old project, including
  `anito-opzava_dokploy-network` if it is owned by the project.
- Removes named and anonymous volumes declared by the old project, including the supplied
  `anito-opzava_*` volumes if the old compose file declares them.
- Does not remove images.
- Does not remove the external shared `dokploy-network`.
- Does not affect project `opzava`, `cavpm`, `kainquest`, or `vdvip`.

### Step 3: remove any leftover old containers by exact name

```bash
docker container rm -f \
  opzava-dokploy-traefik \
  opzava-dokploy-openclaw-gateway \
  anito-opzava-mission-control-1
```

Expected effect: removes only exact old-container leftovers if `down` did not remove them. If
`down` already removed them, Docker reports `No such container` for those names; that is acceptable
as evidence there is no leftover container.

### Step 4: remove leftover old volumes by exact name

```bash
docker volume rm \
  anito-opzava_mc-data \
  anito-opzava_mc-dokploy-data \
  anito-opzava_openclaw-data \
  anito-opzava_openclaw-dokploy-data
```

Expected effect: removes only the old stack's named volumes. If any volume is still in use, stop and
identify the container with `docker ps -a --filter volume=<volume-name>` before retrying.

### Step 5: remove the leftover old project network by exact name

```bash
docker network rm anito-opzava_dokploy-network
```

Expected effect: removes only the old project-scoped network. If Docker reports active endpoints,
inspect them with:

```bash
docker network inspect anito-opzava_dokploy-network \
  --format '{{range $id, $c := .Containers}}{{$c.Name}}{{"\n"}}{{end}}'
```

Do not remove `dokploy-network`.

### Step 6: remove old images explicitly

```bash
docker rmi \
  anito-opzava-mission-control:latest \
  opzava-dokploy-local:latest \
  af7ea052cf21 \
  traefik:v3.7.5
```

Expected effect: removes only old stack images. If Docker refuses because an image is used by
another container, do not force it. Re-run the preflight `ancestor` checks and remove only images
whose consumers are gone or belonged exclusively to `anito-opzava`.

## 4. Post-Removal Verification

Run from any directory after the removal sequence.

### Old stack is gone

```bash
docker ps -a \
  --filter label=com.docker.compose.project=anito-opzava \
  --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
```

Expected result: no output.

```bash
docker container inspect \
  opzava-dokploy-traefik \
  opzava-dokploy-openclaw-gateway \
  anito-opzava-mission-control-1
```

Expected result: Docker reports no such object for all three old container names.

```bash
docker volume inspect \
  anito-opzava_mc-data \
  anito-opzava_mc-dokploy-data \
  anito-opzava_openclaw-data \
  anito-opzava_openclaw-dokploy-data
```

Expected result: Docker reports no such volume for all four old volume names.

```bash
docker network inspect anito-opzava_dokploy-network
```

Expected result: Docker reports no such network.

```bash
docker image inspect \
  anito-opzava-mission-control:latest \
  opzava-dokploy-local:latest \
  af7ea052cf21 \
  traefik:v3.7.5
```

Expected result: Docker reports no such image for each remove-set image. If `traefik:v3.7.5` still
exists because another unrelated stack uses it, that is acceptable only if the preflight identified
that consumer and the image was intentionally preserved.

### Real Opzava stack is intact

```bash
docker ps -a \
  --filter label=com.docker.compose.project=opzava \
  --format '{{.Names}}\t{{.Image}}\t{{.Status}}' \
  | sort
```

Expected result: still lists the protected Opzava containers:

```text
opzava-docker-socket-proxy-1
opzava-gateway-broker-1
opzava-minio-1
opzava-minio-bucket-init-1
opzava-openclaw-platform-gateway-1
opzava-postgres-1
opzava-provisioning-worker-1
opzava-traefik-1
opzava-web-1
```

`opzava-minio-bucket-init-1` may be `Exited (0)` because it is a one-shot initializer. The other
long-running services should remain running or healthy according to their normal state before
removal.

```bash
docker volume inspect \
  opzava-pgdata \
  opzava-minio-data \
  openclaw-platform-config \
  openclaw-platform-workspace \
  openclaw-platform-auth-profiles \
  --format '{{.Name}}'
```

Expected result: all protected Opzava volumes still inspect successfully. If this host uses
Compose-prefixed volume names, verify with:

```bash
docker volume ls --filter label=com.docker.compose.project=opzava
```

Expected result: the Opzava project volumes are still present and none are `anito-opzava_*`.

```bash
docker image inspect opzava/mainframe-gateway:2026.6.11 --format '{{.RepoTags}} {{.Id}}'
docker image ls --format '{{.Repository}}:{{.Tag}}\t{{.ID}}' \
  | grep -E '^(opzava/|opzava-)'
```

Expected result: `opzava/mainframe-gateway:2026.6.11` and the built Opzava service images are still
present. None should resolve to the removed image ID `af7ea052cf21`.

```bash
docker network inspect dokploy-network \
  --format 'network={{.Name}} id={{.Id}} containers={{len .Containers}} labels={{json .Labels}}'
```

Expected result: `dokploy-network` still exists. The real Opzava containers remain attached to it
as before; it must not be removed because it is the shared external parity network.

### Other projects remain untouched

```bash
docker ps -a \
  --filter label=com.docker.compose.project=cavpm \
  --format 'cavpm: {{.Names}}\t{{.Image}}\t{{.Status}}'
docker ps -a \
  --filter label=com.docker.compose.project=kainquest \
  --format 'kainquest: {{.Names}}\t{{.Image}}\t{{.Status}}'
docker ps -a \
  --filter label=com.docker.compose.project=vdvip \
  --format 'vdvip: {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Expected result: whatever containers existed for these projects before removal still exist after
removal. This plan does not target their containers, networks, volumes, or images.

## 5. Risks And Edge Cases

- Image removal is global. The most important guard is the `docker ps -a --filter ancestor=...`
  preflight for `traefik:v3.7.5`, `anito-opzava-mission-control:latest`,
  `opzava-dokploy-local:latest`, and `af7ea052cf21`. Do not force-remove an image that has any
  non-`anito-opzava` consumer.
- `docker compose down --volumes` removes volumes declared by the old compose file. If the old file
  is missing or changed, the explicit `docker volume rm anito-opzava_*` step is the authoritative
  cleanup, guarded by exact names.
- `docker container rm -f` is intentionally exact-name based. It must not be replaced with a broad
  name-prefix command such as `docker rm -f $(docker ps -aq --filter name=opzava)`, which would
  risk the real Opzava stack.
- Do not use prune commands. `docker system prune`, `docker image prune`, `docker volume prune`, and
  `docker network prune` can cross project boundaries and are not part of this plan.
- Do not remove `dokploy-network`. Only remove `anito-opzava_dokploy-network`.
- If an old container is attached to both `anito-opzava_dokploy-network` and `dokploy-network`,
  remove the old container first, then remove only `anito-opzava_dokploy-network`. Shared
  `dokploy-network` remains protected.
- If post-removal Opzava health changes, restore by starting only the real project from
  `/home/anthony/devtony/opzava`; do not recreate `anito-opzava`.
- The supplied preserve list counts "8 containers" but names 9. Protect all 9 named containers.
- The current real Opzava repo uses `traefik:v3.6.1`; if the host preserve stack has independently
  moved to `traefik:v3.7.5`, preserve that image and remove only the other old images after
  container consumers are gone.
