COMPOSE ?= docker compose
PNPM ?= pnpm

.PHONY: up down logs ps dev db-shell bootstrap

# Ensure the shared external network and the local Postgres secret exist before
# any `up`. Idempotent; safe to run repeatedly. The secret is gitignored.
bootstrap:
	@docker network inspect dokploy-network >/dev/null 2>&1 || docker network create dokploy-network
	@test -f secrets/postgres_password || cp secrets/postgres_password.example secrets/postgres_password

up: bootstrap
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

dev:
	$(PNPM) dev

db-shell:
	$(COMPOSE) exec postgres psql -U opzava -d opzava
