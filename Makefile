SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

MODE_GOALS := dev prod
SCOPE_GOALS := all mc openclaw
REQUESTED_MODE := $(firstword $(filter $(MODE_GOALS),$(MAKECMDGOALS)))
REQUESTED_SCOPE := $(firstword $(filter $(SCOPE_GOALS),$(MAKECMDGOALS)))
PASSTHROUGH_GOALS := $(filter $(MODE_GOALS) $(SCOPE_GOALS),$(MAKECMDGOALS))

.PHONY: help up down restart status update rebuild upgrade all mc openclaw dev prod

help:
	@printf '%s\n' \
	  'Opzava Docker operator targets:' \
	  '  make up [all|mc|openclaw] [dev|prod]' \
	  '  make down [all|mc|openclaw] [dev|prod]' \
	  '  make restart [all|mc|openclaw] [dev|prod]' \
	  '  make status [all|mc|openclaw] [dev|prod]' \
	  '  make update [all|mc|openclaw] [dev|prod]' \
	  '  make rebuild [all|mc|openclaw] [dev|prod]' \
	  '  make upgrade [all|mc|openclaw] [dev|prod]' \
	  '' \
	  'Environment: MC_MODE=prod|dev, OPENCLAW_ENABLED=0|1, MC_HOST_CLI_ENABLED=0|1'

define compose_prelude
set -euo pipefail; \
set -a; \
if [ -f .env ]; then . ./.env; fi; \
if [ -f .env.openclaw ]; then . ./.env.openclaw; fi; \
set +a; \
requested_mode="$(REQUESTED_MODE)"; \
requested_scope="$(REQUESTED_SCOPE)"; \
mode="$${requested_mode:-$${MC_MODE:-prod}}"; \
scope="$${requested_scope:-all}"; \
openclaw_enabled="$${OPENCLAW_ENABLED:-0}"; \
host_cli_enabled="$${MC_HOST_CLI_ENABLED:-0}"; \
case "$$mode" in dev) files="-f docker-compose-dev.yml" ;; prod|'') files="-f docker-compose.yml" ;; *) echo "Unsupported MC_MODE: $$mode" >&2; exit 2 ;; esac; \
case "$$scope" in \
  all) services="" ;; \
  mc) services="mission-control" ;; \
  openclaw) services="mc-openclaw-gateway" ;; \
  *) echo "Unsupported scope: $$scope" >&2; exit 2 ;; \
esac; \
case "$$openclaw_enabled" in 1|true|TRUE|yes|YES|on|ON) openclaw_on=1 ;; *) openclaw_on=0 ;; esac; \
case "$$host_cli_enabled" in 1|true|TRUE|yes|YES|on|ON) host_cli_on=1 ;; *) host_cli_on=0 ;; esac; \
if [ "$$scope" = "openclaw" ] || { [ "$$scope" = "all" ] && [ "$$openclaw_on" = "1" ]; }; then \
  files="$$files -f docker-compose-openclaw.yml"; \
fi; \
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
	  url="$${MC_URL_SCHEME:-http}://$${MC_HOST:-127.0.0.1}:$${MC_PORT:-3000}/api/status?action=health"; \
	  echo; echo "+ curl -fsS $$url"; \
	  curl -fsS "$$url" || true; \
	  echo; \
	fi; \
	if [ "$$scope" = "openclaw" ] || { [ "$$scope" = "all" ] && [ "$$openclaw_on" = "1" ]; }; then \
	  gw_url="http://$${OPENCLAW_STATUS_HOST:-127.0.0.1}:$${OPENCLAW_GATEWAY_PORT:-18789}/health"; \
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
	if [ "$$scope" = "openclaw" ] || { [ "$$scope" = "all" ] && [ "$$openclaw_on" = "1" ]; }; then \
	  echo "+ docker compose $$files pull mc-openclaw-gateway"; \
	  docker compose $$files pull mc-openclaw-gateway || true; \
	fi

rebuild:
	@$(compose_prelude); \
	echo "+ docker compose $$files build $$services"; \
	docker compose $$files build $$services

upgrade:
	@$(MAKE) update $(PASSTHROUGH_GOALS)
	@$(MAKE) rebuild $(PASSTHROUGH_GOALS)
	@$(MAKE) restart $(PASSTHROUGH_GOALS)

all mc openclaw dev prod:
	@:
