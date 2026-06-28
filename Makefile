SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

MODE_GOALS := dev parity prod
SCOPE_GOALS := all mc openclaw
REQUESTED_MODE := $(firstword $(filter $(MODE_GOALS),$(MAKECMDGOALS)))
REQUESTED_SCOPE := $(firstword $(filter $(SCOPE_GOALS),$(MAKECMDGOALS)))
PASSTHROUGH_GOALS := $(filter $(MODE_GOALS) $(SCOPE_GOALS),$(MAKECMDGOALS))

.PHONY: help up down restart status update rebuild upgrade all mc openclaw dev parity prod

help:
	@printf '%s\n' \
	  'Opzava Docker operator targets:' \
	  '  make up [all|mc|openclaw] [dev|parity]' \
	  '  make down [all|mc|openclaw] [dev|parity]' \
	  '  make restart [all|mc|openclaw] [dev|parity]' \
	  '  make status [all|mc|openclaw] [dev|parity]' \
	  '  make update [all|mc|openclaw] [dev|parity]' \
	  '  make rebuild [all|mc|openclaw] [dev|parity]' \
	  '  make upgrade [all|mc|openclaw] [dev|parity]' \
	  '' \
	  'Default app runtime: parity (docker-compose.yml + docker-compose.parity.yml)' \
	  'Environment: MC_MODE=parity|dev, MC_HOST_CLI_ENABLED=0|1'

define compose_prelude
set -euo pipefail; \
set -a; \
if [ -f .env ]; then . ./.env; fi; \
if [ -f .env.openclaw ]; then . ./.env.openclaw; fi; \
set +a; \
requested_mode="$(REQUESTED_MODE)"; \
requested_scope="$(REQUESTED_SCOPE)"; \
mode="$${requested_mode:-$${MC_MODE:-parity}}"; \
scope="$${requested_scope:-all}"; \
host_cli_enabled="$${MC_HOST_CLI_ENABLED:-0}"; \
case "$$mode" in dev) files="-f docker-compose.yml -f docker-compose.dev.yml" ;; parity|prod|'') files="-f docker-compose.yml -f docker-compose.parity.yml" ;; *) echo "Unsupported MC_MODE: $$mode" >&2; exit 2 ;; esac; \
case "$$scope" in \
  all) services="" ;; \
  mc) services="mission-control" ;; \
  openclaw) services="mc-openclaw-gateway" ;; \
  *) echo "Unsupported scope: $$scope" >&2; exit 2 ;; \
esac; \
case "$$host_cli_enabled" in 1|true|TRUE|yes|YES|on|ON) host_cli_on=1 ;; *) host_cli_on=0 ;; esac; \
if [ "$$host_cli_on" = "1" ] && [ "$$scope" != "openclaw" ]; then \
  files="$$files -f docker-compose.host-cli.yml"; \
fi
endef

up:
	@$(compose_prelude); \
	echo "+ docker compose $$files up -d --build $$services"; \
	docker compose $$files up -d --build $$services

down:
	@$(compose_prelude); \
	if [ "$$scope" = "all" ]; then \
	  echo "+ docker compose $$files down"; \
	  docker compose $$files down; \
	else \
	  echo "+ docker compose $$files stop $$services && docker compose $$files rm -f $$services"; \
	  docker compose $$files stop $$services || true; \
	  docker compose $$files rm -f $$services; \
	fi

restart:
	@$(compose_prelude); \
	if [ "$$scope" = "all" ]; then \
	  echo "+ docker compose $$files down"; \
	  docker compose $$files down; \
	else \
	  echo "+ docker compose $$files stop $$services && docker compose $$files rm -f $$services"; \
	  docker compose $$files stop $$services || true; \
	  docker compose $$files rm -f $$services; \
	fi; \
	echo "+ docker compose $$files up -d --build $$services"; \
	docker compose $$files up -d --build $$services

status:
	@$(compose_prelude); \
	echo "+ docker compose $$files ps"; \
	docker compose $$files ps; \
	if [ "$$scope" != "openclaw" ]; then \
	  url="$${MC_URL_SCHEME:-http}://$${DOKPLOY_LOCAL_DOMAIN:-opzava.localhost}:$${DOKPLOY_HTTP_PORT:-3080}/api/status?action=health"; \
	  echo; echo "+ curl -fsS $$url"; \
	  curl -fsS "$$url" || true; \
	  echo; \
	fi; \
	if [ "$$scope" = "openclaw" ] || [ "$$scope" = "all" ]; then \
	  gw_url="$${MC_URL_SCHEME:-http}://$${DOKPLOY_GATEWAY_LOCAL_DOMAIN:-opzava-gateway.localhost}:$${DOKPLOY_HTTP_PORT:-3080}/health"; \
	  echo; echo "+ curl -fsS $$gw_url"; \
	  curl -fsS "$$gw_url" || true; \
	  echo; \
	fi

update:
	@$(compose_prelude); \
	if [ "$$scope" != "openclaw" ]; then \
	  echo "+ git pull --ff-only"; \
	  git pull --ff-only; \
	fi; \
	echo "+ docker compose $$files pull mc-openclaw-gateway"; \
	docker compose $$files pull mc-openclaw-gateway || true

rebuild:
	@$(compose_prelude); \
	echo "+ docker compose $$files build $$services"; \
	docker compose $$files build $$services

upgrade:
	@$(MAKE) update $(PASSTHROUGH_GOALS)
	@$(MAKE) rebuild $(PASSTHROUGH_GOALS)
	@$(MAKE) restart $(PASSTHROUGH_GOALS)

all mc openclaw dev parity prod:
	@:
