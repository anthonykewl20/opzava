#!/usr/bin/env bash
# Opzava — One-Command Installer
# The control plane for your AI operations fleet.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/anthonykewl20/opzava/main/install.sh | bash
#   # or
#   bash install.sh [--docker|--local] [--port PORT] [--data-dir DIR]
#
# Installs Opzava. OpenClaw is managed only as the Docker sidecar.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
MC_PORT="${MC_PORT:-3000}"
MC_DATA_DIR=""
DEPLOY_MODE=""
SKIP_OPENCLAW=false
REPO_URL="https://github.com/anthonykewl20/opzava.git"
INSTALL_DIR="${MC_INSTALL_DIR:-$(pwd)/opzava}"

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker)       DEPLOY_MODE="docker"; shift ;;
    --local)        DEPLOY_MODE="local"; shift ;;
    --port)         MC_PORT="$2"; shift 2 ;;
    --data-dir)     MC_DATA_DIR="$2"; shift 2 ;;
    --skip-openclaw) SKIP_OPENCLAW=true; shift ;; # compatibility: skips sidecar check
    --dir)          INSTALL_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: install.sh [--docker|--local] [--port PORT] [--data-dir DIR] [--dir INSTALL_DIR] [--skip-openclaw]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo -e "\033[1;34m[MC]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[!!]\033[0m $*"; }
err()   { echo -e "\033[1;31m[ERR]\033[0m $*" >&2; }
die()   { err "$*"; exit 1; }

command_exists() { command -v "$1" &>/dev/null; }

truthy() { [[ "${1:-}" =~ ^(1|true|TRUE|yes|YES|on|ON)$ ]]; }

env_value() {
  local key="$1" default="${2:-}" value="${!key-}"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return
  fi
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    value="$(grep -E "^[[:space:]]*${key}=" "$INSTALL_DIR/.env" | tail -n 1 | sed -E "s/^[[:space:]]*${key}=//; s/^\"//; s/\"$//" || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return
    fi
  fi
  printf '%s' "$default"
}

# Escape sed replacement metacharacters (|, &, \) in a value.
# Does not handle newlines — callers must ensure single-line input.
sed_escape() { printf '%s' "$1" | sed 's/[|&\\]/\\&/g'; }

# Portable in-place sed (macOS requires -i '', Linux uses -i)
portable_sed() {
  local pattern="$1" file="$2"
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "$pattern" "$file"
  else
    sed -i "$pattern" "$file"
  fi
}

detect_os() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)  OS="linux" ;;
    Darwin) OS="darwin" ;;
    *)      die "Unsupported OS: $os" ;;
  esac

  case "$arch" in
    x86_64|amd64)  ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)             die "Unsupported architecture: $arch" ;;
  esac

  ok "Detected $OS/$ARCH"
}

check_prerequisites() {
  local has_docker=false has_node=false

  if command_exists docker && docker info &>/dev/null 2>&1; then
    has_docker=true
    ok "Docker available ($(docker --version | head -1))"
  fi

  if command_exists node; then
    local node_major
    node_major=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_major" -ge 20 ]]; then
      has_node=true
      ok "Node.js $(node -v) available"
    else
      warn "Node.js $(node -v) found but v20+ required"
    fi
  fi

  if ! $has_docker && ! $has_node; then
    die "Either Docker or Node.js 20+ is required. Install one and retry."
  fi

  # Auto-select deploy mode if not specified
  if [[ -z "$DEPLOY_MODE" ]]; then
    if $has_docker; then
      DEPLOY_MODE="docker"
      info "Auto-selected Docker deployment (use --local to override)"
    else
      DEPLOY_MODE="local"
      info "Auto-selected local deployment (Docker not available)"
    fi
  fi

  # Validate chosen mode
  if [[ "$DEPLOY_MODE" == "docker" ]] && ! $has_docker; then
    die "Docker deployment requested but Docker is not available"
  fi
  if [[ "$DEPLOY_MODE" == "local" ]] && ! $has_node; then
    die "Local deployment requested but Node.js 20+ is not available"
  fi
  if [[ "$DEPLOY_MODE" == "local" ]] && ! command_exists pnpm; then
    info "Installing pnpm via corepack..."
    corepack enable && corepack prepare pnpm@latest --activate
    ok "pnpm installed"
  fi
}

# ── Clone or update repo ─────────────────────────────────────────────────────
fetch_source() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Updating existing installation at $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git fetch --tags
    local latest_tag
    latest_tag=$(git describe --tags --abbrev=0 origin/main 2>/dev/null || echo "")
    if [[ -n "$latest_tag" ]]; then
      git checkout "$latest_tag"
      ok "Checked out $latest_tag"
    else
      git pull origin main
      ok "Updated to latest main"
    fi
  else
    info "Cloning Opzava..."
    if command_exists git; then
      git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
      cd "$INSTALL_DIR"
      ok "Cloned to $INSTALL_DIR"
    else
      die "git is required to clone the repository"
    fi
  fi
}

# ── Generate .env ─────────────────────────────────────────────────────────────
setup_env() {
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    info "Existing .env found — keeping current configuration"
    return
  fi

  info "Generating secure .env configuration..."
  bash "$INSTALL_DIR/scripts/generate-env.sh" "$INSTALL_DIR/.env"

  # Set the port if non-default
  if [[ "$MC_PORT" != "3000" ]]; then
    portable_sed "s|^# PORT=3000|PORT=$(sed_escape "$MC_PORT")|" "$INSTALL_DIR/.env"
  fi

  # In Docker mode, OpenClaw is managed as the mc-openclaw-gateway sidecar.
  # Do not point Opzava at a host-installed OpenClaw binary/gateway.
  if [[ "$DEPLOY_MODE" == "docker" ]]; then
    portable_sed "s|^# OPENCLAW_GATEWAY_HOST=.*|OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway|" "$INSTALL_DIR/.env"
    portable_sed "s|^# OPENCLAW_STATE_DIR=.*|OPENCLAW_STATE_DIR=/home/nextjs/.openclaw|" "$INSTALL_DIR/.env"
    portable_sed "s|^# OPENCLAW_CONFIG_PATH=.*|OPENCLAW_CONFIG_PATH=/home/nextjs/.openclaw/openclaw.json|" "$INSTALL_DIR/.env"
    info "Configured OpenClaw for the Docker sidecar (mc-openclaw-gateway)"
  fi

  ok "Secure .env generated"
}

# ── Docker deployment ─────────────────────────────────────────────────────────
deploy_docker() {
  info "Starting Docker deployment..."

  export MC_PORT
  local compose_files=(-f docker-compose.yml)
  if truthy "$(env_value OPENCLAW_ENABLED 0)"; then
    compose_files+=(-f docker-compose-openclaw.yml)
  fi
  docker compose "${compose_files[@]}" up -d --build

  # Wait for healthy
  info "Waiting for Opzava to become healthy..."
  local retries=30
  while [[ $retries -gt 0 ]]; do
    if docker compose ps --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
      break
    fi
    # Fallback: try HTTP check
    if curl -sf "http://localhost:$MC_PORT/login" &>/dev/null; then
      break
    fi
    sleep 2
    ((retries--))
  done

  if [[ $retries -eq 0 ]]; then
    warn "Timeout waiting for health check — container may still be starting"
    docker compose logs --tail 20
  else
    ok "Opzava is running in Docker"
  fi
}

# ── Local deployment ──────────────────────────────────────────────────────────
deploy_local() {
  info "Starting local deployment..."

  cd "$INSTALL_DIR"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm rebuild better-sqlite3 2>/dev/null || true
  ok "Dependencies installed"

  info "Building Opzava..."
  pnpm build
  ok "Build complete"

  # Create systemd service on Linux if systemctl is available
  if [[ "$OS" == "linux" ]] && command_exists systemctl; then
    setup_systemd
  fi

  info "Starting Opzava..."
  PORT="$MC_PORT" nohup pnpm start > "$INSTALL_DIR/.data/mc.log" 2>&1 &
  local pid=$!
  echo "$pid" > "$INSTALL_DIR/.data/mc.pid"

  sleep 3
  if kill -0 "$pid" 2>/dev/null; then
    ok "Opzava running (PID $pid)"
  else
    err "Failed to start. Check logs: $INSTALL_DIR/.data/mc.log"
    exit 1
  fi
}

# ── Systemd service ──────────────────────────────────────────────────────────
setup_systemd() {
  local service_file="/etc/systemd/system/opzava.service"
  if [[ -f "$service_file" ]]; then
    info "Systemd service already exists"
    return
  fi

  info "Creating systemd service..."
  local user
  user="$(whoami)"
  local node_path
  node_path="$(which node)"

  cat > /tmp/opzava.service <<UNIT
[Unit]
Description=Opzava Control Plane
After=network.target

[Service]
Type=simple
User=$user
WorkingDirectory=$INSTALL_DIR
ExecStart=$node_path $INSTALL_DIR/.next/standalone/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$MC_PORT
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
UNIT

  if [[ "$(id -u)" -eq 0 ]]; then
    mv /tmp/opzava.service "$service_file"
    systemctl daemon-reload
    systemctl enable opzava
    ok "Systemd service installed and enabled"
  else
    info "Run as root to install systemd service:"
    info "  sudo mv /tmp/opzava.service $service_file"
    info "  sudo systemctl daemon-reload && sudo systemctl enable --now opzava"
  fi
}

# ── OpenClaw sidecar check ───────────────────────────────────────────────────
check_openclaw() {
  if $SKIP_OPENCLAW; then
    info "Skipping OpenClaw sidecar check (--skip-openclaw)"
    return
  fi

  echo ""
  info "=== OpenClaw Docker Sidecar Check ==="

  if ! truthy "$(env_value OPENCLAW_ENABLED 0)"; then
    info "OpenClaw sidecar disabled (OPENCLAW_ENABLED=0)"
    info "Enable with: OPENCLAW_ENABLED=1 make up openclaw"
    return
  fi

  if docker compose -f docker-compose.yml -f docker-compose-openclaw.yml ps mc-openclaw-gateway 2>/dev/null | grep -q mc-openclaw-gateway; then
    ok "OpenClaw sidecar service is present"
  else
    warn "OpenClaw sidecar service is not running"
    info "Start it with: OPENCLAW_ENABLED=1 make up openclaw"
  fi

  local gw_host gw_port
  gw_host="$(env_value OPENCLAW_GATEWAY_HOST mc-openclaw-gateway)"
  gw_port="$(env_value OPENCLAW_GATEWAY_PORT 18789)"
  if [[ "$gw_host" == "mc-openclaw-gateway" ]]; then
    gw_host="127.0.0.1"
  fi
  if curl -fsS "http://$gw_host:$gw_port/health" >/dev/null 2>&1; then
    ok "Gateway reachable at $gw_host:$gw_port"
  else
    info "Gateway not reachable at $gw_host:$gw_port (start sidecar with: OPENCLAW_ENABLED=1 make up openclaw)"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║   Opzava Installer          ║"
  echo "  ║   The mothership for your fleet      ║"
  echo "  ╚══════════════════════════════════════╝"
  echo ""

  detect_os
  check_prerequisites

  # If running from within an existing clone, use current dir
  if [[ -f "$(pwd)/package.json" ]] && grep -q '"opzava"' "$(pwd)/package.json" 2>/dev/null; then
    INSTALL_DIR="$(pwd)"
    info "Running from existing clone at $INSTALL_DIR"
  else
    fetch_source
  fi

  # Ensure data directory exists
  mkdir -p "$INSTALL_DIR/.data"

  setup_env

  case "$DEPLOY_MODE" in
    docker) deploy_docker ;;
    local)  deploy_local ;;
    *)      die "Unknown deploy mode: $DEPLOY_MODE" ;;
  esac

  check_openclaw

  # ── Print summary ──
  echo ""
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║   Installation Complete              ║"
  echo "  ╚══════════════════════════════════════╝"
  echo ""
  info "Dashboard:  http://localhost:$MC_PORT"
  info "Mode:       $DEPLOY_MODE"
  info "Data:       $INSTALL_DIR/.data/"
  echo ""
  info "Credentials are in: $INSTALL_DIR/.env"
  echo ""

  if [[ "$DEPLOY_MODE" == "docker" ]]; then
    info "Manage:"
    info "  docker compose logs -f        # view logs"
    info "  docker compose restart         # restart"
    info "  docker compose down            # stop"
  else
    info "Manage:"
    info "  cat $INSTALL_DIR/.data/mc.log  # view logs"
    info "  kill \$(cat $INSTALL_DIR/.data/mc.pid)  # stop"
  fi

  echo ""
}

main "$@"
