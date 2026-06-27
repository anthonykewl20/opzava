#Requires -Version 5.1
<#
.SYNOPSIS
    Opzava — Windows Installer
    The Opzava control plane installer.

.DESCRIPTION
    Installs Opzava on Windows via local Node.js deployment.
    Mirrors the behaviour of install.sh for Linux/macOS. OpenClaw runs only as
    the Docker sidecar for this app; the installer does not install or start a
    host OpenClaw CLI.

.PARAMETER Mode
    Deployment mode: "local" (default) or "docker".

.PARAMETER Port
    Port the Next.js server listens on (default: 3000).

.PARAMETER DataDir
    Custom data directory path (default: .data/ in project root).

.PARAMETER InstallDir
    Target directory when cloning from GitHub (default: .\opzava).

.PARAMETER SkipOpenClaw
    Skip OpenClaw Docker sidecar checks.

.EXAMPLE
    .\install.ps1
    .\install.ps1 -Mode local -Port 8080
    .\install.ps1 -Mode docker

.NOTES
    PowerShell uses single-dash parameters: -Mode local, -Port 8080
    Bash-style --local / --docker flags are NOT supported by PowerShell syntax.
#>

[CmdletBinding()]
param(
    [ValidateSet("local", "docker")]
    [string]$Mode = "",

    [int]$Port = 3000,

    [string]$DataDir = "",

    [string]$InstallDir = "",

    [switch]$SkipOpenClaw
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Defaults ──────────────────────────────────────────────────────────────────
if (-not $InstallDir) {
    $InstallDir = if ($env:MC_INSTALL_DIR) { $env:MC_INSTALL_DIR } else { Join-Path (Get-Location) "opzava" }
}
$RepoUrl = "https://github.com/anthonykewl20/opzava.git"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-MC   { param([string]$Msg) Write-Host "[MC] $Msg" -ForegroundColor Blue }
function Write-Ok   { param([string]$Msg) Write-Host "[OK] $Msg" -ForegroundColor Green }
function Write-Warn { param([string]$Msg) Write-Host "[!!] $Msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$Msg) Write-Host "[ERR] $Msg" -ForegroundColor Red }
function Stop-WithError { param([string]$Msg) Write-Err $Msg; exit 1 }

function Test-Command { param([string]$Name) $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

function Test-Truthy {
    param([string]$Value)
    return $Value -match '^(1|true|yes|on)$'
}

function Get-EnvSetting {
    param(
        [string]$Name,
        [string]$Default = ""
    )

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ($value) { return $value }

    $envPath = Join-Path $script:InstallDir ".env"
    if (Test-Path $envPath) {
        $line = Get-Content $envPath | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))=(.*)$" } | Select-Object -First 1
        if ($line) {
            return ($line -replace "^\s*$([regex]::Escape($Name))=", "").Trim().Trim('"')
        }
    }

    return $Default
}

function Get-RandomPassword {
    param([int]$Length = 24)
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] $Length
    $rng.GetBytes($bytes)
    -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

function Get-RandomHex {
    param([int]$Length = 32)
    $bytes = New-Object byte[] ($Length / 2)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ($bytes | ForEach-Object { $_.ToString("x2") }) -join ''
}

# ── Prerequisites ─────────────────────────────────────────────────────────────
function Test-Prerequisites {
    $hasDocker = $false
    $hasNode = $false

    if (Test-Command "docker") {
        docker info *>$null
        if ($LASTEXITCODE -eq 0) {
            $hasDocker = $true
            $dockerVersion = (docker --version) -split "`n" | Select-Object -First 1
            Write-Ok "Docker available ($dockerVersion)"
        } else {
            Write-Warn "Docker found but daemon is not running"
        }
    }

    if (Test-Command "node") {
        $nodeVersion = (node -v).TrimStart('v')
        $nodeMajor = [int]($nodeVersion -split '\.')[0]
        if ($nodeMajor -ge 22) {
            $hasNode = $true
            Write-Ok "Node.js v$nodeVersion available"
        } else {
            Write-Warn "Node.js v$nodeVersion found but v22+ required (LTS recommended)"
        }
    }

    if (-not $hasDocker -and -not $hasNode) {
        Stop-WithError "Either Docker or Node.js 22+ is required. Install one and retry."
    }

    # Auto-select deploy mode if not specified
    if (-not $script:Mode) {
        if ($hasDocker) {
            $script:Mode = "docker"
            Write-MC "Auto-selected Docker deployment (use -Mode local to override)"
        } else {
            $script:Mode = "local"
            Write-MC "Auto-selected local deployment (Docker not available)"
        }
    }

    # Validate chosen mode
    if ($script:Mode -eq "docker" -and -not $hasDocker) {
        Stop-WithError "Docker deployment requested but Docker is not available"
    }
    if ($script:Mode -eq "local" -and -not $hasNode) {
        Stop-WithError "Local deployment requested but Node.js 22+ is not available"
    }
    if ($script:Mode -eq "local" -and -not (Test-Command "pnpm")) {
        Write-MC "Installing pnpm via corepack..."
        corepack enable
        corepack prepare pnpm@latest --activate
        Write-Ok "pnpm installed"
    }
}

# ── Clone or update repo ─────────────────────────────────────────────────────
function Get-Source {
    if (Test-Path (Join-Path $script:InstallDir ".git")) {
        Write-MC "Updating existing installation at $($script:InstallDir)..."
        Push-Location $script:InstallDir
        try {
            git fetch --tags
            $latestTag = git describe --tags --abbrev=0 origin/main 2>$null
            if ($latestTag) {
                git checkout $latestTag
                Write-Ok "Checked out $latestTag"
            } else {
                git pull origin main
                Write-Ok "Updated to latest main"
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-MC "Cloning Opzava..."
        if (-not (Test-Command "git")) {
            Stop-WithError "git is required to clone the repository"
        }
        git clone --depth 1 $RepoUrl $script:InstallDir
        Write-Ok "Cloned to $($script:InstallDir)"
    }
}

# ── Generate .env ─────────────────────────────────────────────────────────────
function New-EnvFile {
    $envPath = Join-Path $script:InstallDir ".env"
    $examplePath = Join-Path $script:InstallDir ".env.example"

    if (Test-Path $envPath) {
        Write-MC "Existing .env found - keeping current configuration"
        return
    }

    if (-not (Test-Path $examplePath)) {
        Stop-WithError ".env.example not found at $examplePath"
    }

    Write-MC "Generating secure .env configuration..."

    $authPass = Get-RandomPassword 24
    $apiKey = Get-RandomHex 32
    $authSecret = Get-RandomPassword 32

    $content = Get-Content $examplePath -Raw
    $content = $content -replace '(?m)^# AUTH_USER=.*',   "AUTH_USER=admin"
    $content = $content -replace '(?m)^# AUTH_PASS=.*',   "AUTH_PASS=$authPass"
    $content = $content -replace '(?m)^# API_KEY=.*',     "API_KEY=$apiKey"
    $content = $content -replace '(?m)^# AUTH_SECRET=.*',  "AUTH_SECRET=$authSecret"

    # Set port if non-default
    if ($script:Port -ne 3000) {
        $content = $content -replace '(?m)^# PORT=3000', "PORT=$($script:Port)"
    }

    if ($script:Mode -eq "docker") {
        $content = $content -replace '(?m)^# OPENCLAW_GATEWAY_HOST=.*', "OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway"
        $content = $content -replace '(?m)^# OPENCLAW_STATE_DIR=.*', "OPENCLAW_STATE_DIR=/home/nextjs/.openclaw"
        $content = $content -replace '(?m)^# OPENCLAW_CONFIG_PATH=.*', "OPENCLAW_CONFIG_PATH=/home/nextjs/.openclaw/openclaw.json"
    }

    $content | Set-Content $envPath -NoNewline
    Write-Ok "Secure .env generated"

    Write-Host ""
    Write-Host "  AUTH_USER: admin" -ForegroundColor Cyan
    Write-Host "  AUTH_PASS: $authPass" -ForegroundColor Cyan
    Write-Host "  API_KEY:   $apiKey" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Save these credentials - they are not stored elsewhere." -ForegroundColor Yellow
    Write-Host ""
}

# ── Docker deployment ─────────────────────────────────────────────────────────
function Deploy-Docker {
    Write-MC "Starting Docker deployment..."

    Push-Location $script:InstallDir
    try {
        $env:MC_PORT = $script:Port
        $composeFileArgs = @()
        if (Test-Truthy (Get-EnvSetting "OPENCLAW_ENABLED" "0")) {
            $composeFileArgs = @("-f", "docker-compose.yml", "-f", "docker-compose-openclaw.yml")
            Write-MC "OpenClaw sidecar enabled via docker-compose-openclaw.yml"
        }
        docker compose @composeFileArgs up -d --build

        Write-MC "Waiting for Opzava to become healthy..."
        $retries = 30
        while ($retries -gt 0) {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:$($script:Port)/login" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($response.StatusCode -eq 200) { break }
            } catch { }
            Start-Sleep -Seconds 2
            $retries--
        }

        if ($retries -eq 0) {
            Write-Warn "Timeout waiting for health check - container may still be starting"
            docker compose @composeFileArgs logs --tail 20
        } else {
            Write-Ok "Opzava is running in Docker"
        }
    } finally {
        Pop-Location
    }
}

# ── Local deployment ──────────────────────────────────────────────────────────
function Deploy-Local {
    Write-MC "Starting local deployment..."

    Push-Location $script:InstallDir
    try {
        pnpm install --frozen-lockfile 2>$null
        if ($LASTEXITCODE -ne 0) { pnpm install }
        Write-Ok "Dependencies installed"

        Write-MC "Building Opzava..."
        pnpm build
        if ($LASTEXITCODE -ne 0) { Stop-WithError "Build failed" }
        Write-Ok "Build complete"

        # Copy static assets into standalone directory (required by Next.js standalone mode)
        $standaloneDir = Join-Path $script:InstallDir ".next" | Join-Path -ChildPath "standalone"
        $standaloneNextDir = Join-Path $standaloneDir ".next"
        $sourceStatic = Join-Path $script:InstallDir ".next" | Join-Path -ChildPath "static"
        $destStatic = Join-Path $standaloneNextDir "static"
        $sourcePublic = Join-Path $script:InstallDir "public"
        $destPublic = Join-Path $standaloneDir "public"

        if (Test-Path $sourceStatic) {
            if (Test-Path $destStatic) { Remove-Item $destStatic -Recurse -Force }
            Copy-Item $sourceStatic $destStatic -Recurse
        }
        if (Test-Path $sourcePublic) {
            if (Test-Path $destPublic) { Remove-Item $destPublic -Recurse -Force }
            Copy-Item $sourcePublic $destPublic -Recurse
        }
        Write-Ok "Static assets copied to standalone directory"

        Write-MC "Starting Opzava..."
        $env:PORT = $script:Port
        $env:NODE_ENV = "production"
        $env:HOSTNAME = "0.0.0.0"
        $dataPath = Join-Path $script:InstallDir ".data"
        $logPath = Join-Path $dataPath "mc.log"
        $errLogPath = Join-Path $dataPath "mc-err.log"
        $pidPath = Join-Path $dataPath "mc.pid"

        $serverJs = Join-Path $standaloneDir "server.js"
        $process = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c node `"$serverJs`" > `"$logPath`" 2> `"$errLogPath`"" `
            -WorkingDirectory $script:InstallDir `
            -WindowStyle Hidden `
            -PassThru
        $process.Id | Set-Content $pidPath

        Start-Sleep -Seconds 3
        if (-not $process.HasExited) {
            Write-Ok "Opzava running (PID $($process.Id))"
        } else {
            Write-Err "Failed to start. Check logs: $logPath"
            exit 1
        }
    } finally {
        Pop-Location
    }
}

# ── OpenClaw Docker sidecar check ────────────────────────────────────────────
function Test-OpenClaw {
    if ($SkipOpenClaw) {
        Write-MC "Skipping OpenClaw checks (-SkipOpenClaw)"
        return
    }

    Write-Host ""
    Write-MC "=== OpenClaw Docker Sidecar Check ==="

    if (-not (Test-Truthy (Get-EnvSetting "OPENCLAW_ENABLED" "0"))) {
        Write-MC "OpenClaw sidecar disabled. Set OPENCLAW_ENABLED=1 in .env to enable it."
        Write-MC "  docker compose -f docker-compose.yml -f docker-compose-openclaw.yml up -d --build"
        return
    }

    if ($Mode -ne "docker") {
        Write-Warn "OpenClaw is Docker-managed; local Opzava mode will not install or start a host OpenClaw CLI."
        Write-MC "Start the sidecar from a Docker deployment when fleet gateway connectivity is required."
        return
    }

    $composeFileArgs = @("-f", "docker-compose.yml", "-f", "docker-compose-openclaw.yml")
    $sidecar = docker compose @composeFileArgs ps mc-openclaw-gateway 2>$null
    if ($LASTEXITCODE -eq 0 -and $sidecar -match "mc-openclaw-gateway") {
        Write-Ok "OpenClaw sidecar is present in Docker Compose"
    } else {
        Write-Warn "OpenClaw sidecar is not running"
        Write-MC "  docker compose -f docker-compose.yml -f docker-compose-openclaw.yml up -d --build mc-openclaw-gateway"
        return
    }

    $gwHost = Get-EnvSetting "OPENCLAW_GATEWAY_HOST" "mc-openclaw-gateway"
    $gwPort = [int](Get-EnvSetting "OPENCLAW_GATEWAY_PORT" "18789")
    $probeHost = if ($gwHost -eq "mc-openclaw-gateway") { "127.0.0.1" } else { $gwHost }
    try {
        Invoke-WebRequest -Uri "http://${probeHost}:${gwPort}/health" -UseBasicParsing -TimeoutSec 3 | Out-Null
        Write-Ok "Gateway reachable at ${gwHost}:${gwPort}"
    } catch {
        Write-Warn "Gateway not reachable at ${gwHost}:${gwPort}"
        Write-MC "  docker compose -f docker-compose.yml -f docker-compose-openclaw.yml logs --tail 50 mc-openclaw-gateway"
    }
}

# ── Main ──────────────────────────────────────────────────────────────────────
function Main {
    Write-Host ""
    Write-Host "  +======================================+" -ForegroundColor Magenta
    Write-Host "  |   Opzava Installer          |" -ForegroundColor Magenta
    Write-Host "  |   The mothership for your fleet      |" -ForegroundColor Magenta
    Write-Host "  +======================================+" -ForegroundColor Magenta
    Write-Host ""

    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    Write-Ok "Detected Windows/$arch"

    Test-Prerequisites

    # If running from within an existing clone, use current dir
    $packageJson = Join-Path (Get-Location) "package.json"
    if ((Test-Path $packageJson) -and (Select-String -Path $packageJson -Pattern '"opzava"' -Quiet)) {
        $script:InstallDir = (Get-Location).Path
        Write-MC "Running from existing clone at $($script:InstallDir)"
    } else {
        Get-Source
    }

    # Ensure data directory exists
    $dataDir = Join-Path $script:InstallDir ".data"
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    }

    New-EnvFile

    switch ($Mode) {
        "docker" { Deploy-Docker }
        "local"  { Deploy-Local }
        default  { Stop-WithError "Unknown deploy mode: $Mode" }
    }

    Test-OpenClaw

    # ── Print summary ──
    Write-Host ""
    Write-Host "  +======================================+" -ForegroundColor Green
    Write-Host "  |   Installation Complete               |" -ForegroundColor Green
    Write-Host "  +======================================+" -ForegroundColor Green
    Write-Host ""
    Write-MC "Dashboard:  http://localhost:$Port"
    Write-MC "Mode:       $Mode"
    Write-MC "Data:       $(Join-Path $script:InstallDir '.data')"
    Write-Host ""
    Write-MC "Credentials are in: $(Join-Path $script:InstallDir '.env')"
    Write-Host ""

    if ($Mode -eq "docker") {
        Write-MC "Manage:"
        Write-MC "  docker compose logs -f        # view logs"
        Write-MC "  docker compose restart         # restart"
        Write-MC "  docker compose down            # stop"
    } else {
        $mcDataPath = Join-Path $script:InstallDir ".data"
        $pidPath = Join-Path $mcDataPath "mc.pid"
        $logPath = Join-Path $mcDataPath "mc.log"
        Write-MC "Manage:"
        Write-MC "  Get-Content '$logPath' -Tail 50   # view logs"
        Write-MC "  Stop-Process -Id (Get-Content '$pidPath')  # stop"
    }
    Write-Host ""
}

Main
