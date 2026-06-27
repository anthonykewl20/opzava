# Daily Ops Cheatsheet

Use the root `Makefile` for Docker operations. It sources `.env` and `.env.openclaw`
at runtime, so mode/port changes do not require editing commands.

## Common Commands

```bash
make status
make up
make restart
make down
make upgrade
```

## Scopes

```bash
make status mc
make restart mc
make status openclaw
make restart openclaw
```

OpenClaw runs only as the Docker sidecar:

```bash
OPENCLAW_ENABLED=1 make up openclaw
OPENCLAW_ENABLED=1 make upgrade openclaw
```

## Modes

```bash
make up prod
make up dev
make restart mc prod
make restart mc dev
```

## Useful Flags

Set these in `.env` or before a command:

```bash
MC_MODE=prod
OPENCLAW_ENABLED=0
MC_HOST_CLI_ENABLED=0
MC_PORT=3000
```

For a single-host operator setup that lets Opzava drive authenticated host
Claude Code/Codex CLIs without OpenClaw:

```bash
MC_HOST_CLI_ENABLED=1 OPENCLAW_ENABLED=0 make up mc
```
