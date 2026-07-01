```
1) services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      CONTAINERS: 1
      NETWORKS: 1
      IMAGES: 1
      POST: 1      # needed for container create/start
      VOLUMES: 0; EVENTS: 0; EXEC: 0; TASKS: 0; BUILD: 0; COMMIT: 0; CPUSET: 0; INFO: 0; PING: 0; SWARM: 0; SYSTEM: 0; VERSION: 0
    volumes: ["/var/run/docker.sock:/var/run/docker.sock:ro"]
    ports: ["2375:2375"]
  traefik:
    image: traefik:v3.1
    command: --providers.docker.endpoint=http://socket-proxy:2375 --providers.docker=true --entrypoints.web.address=:80 --api.insecure=true
    ports: ["80:80","8080:8080"]
    depends_on: [socket-proxy]
  worker, broker, mock-base: see below; all on net: opznet (external, pre-created: docker network create opznet)

2) traefik static: as above (no docker.sock direct). Dynamic labels on each tenant container:
  traefik.enable=true
  traefik.docker.network=opznet
  traefik.http.routers.t-<id>.rule=Host(`t-<id>.localhost`)
  traefik.http.routers.t-<id>.entrypoints=web
  traefik.http.services.t-<id>.loadbalancer.server.port=8080

3) worker uses dockerode pointing at http://socket-proxy:2375:
  await docker.createContainer({
    Image: 'mock-gateway:latest',
    Env: ['TENANT_ID=<id>'],
    HostConfig: { NetworkMode: 'opznet' },
    NetworkingConfig: { EndpointsConfig: { opznet: {} } },
    Labels: { /* traefik labels from (2) with t-<id> */ }
  });
  then container.start().

4) Faithful-to-prod = dial via Traefik host http://t-<id>.localhost (round-trips Traefik routing, label-driven discovery, TLS-terminator-ready). Container-name DNS bypasses Traefik entirely and only proves L3, not the routing contract you’re de-risking.

5) PASS = broker WS to ws://t-<id>.localhost streams ≥1 token; received payload contains {tenant_id,<id>,seq≥0} for 3 consecutive pings, then ack closes cleanly. FAIL = anything else; dump `docker logs traefik`, `docker inspect <c>`.

6) Gotchas:
  - Plain containers: Traefik docker provider needs `traefik.docker.network` set when multiple nets attached; without it, router binds to wrong IP. Per-container service port MUST be the container’s listening port, not host-mapped.
  - socket-proxy POST=1 alone is insufficient for create+start+attach; workers also need IMAGES=1 (pull) and NETWORKS=1 (connect/EndpointsConfig). Missing → 403 from proxy.
  - Networking: worker must attach tenant container to the SAME external network Traefik watches (opznet). Don’t rely on default bridge—Traefik won’t see it, and container-name DNS fails across bridge.
```
