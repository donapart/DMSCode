# ═══════════════════════════════════════════════════════════════════════════════
# DMSCode Backend Deployment für Hetzner (PowerShell Version)
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [Parameter(Position=0)]
    [ValidateSet("deploy", "upload", "start", "stop", "restart", "logs", "status", "health")]
    [string]$Command = "deploy",
    
    [string]$HetznerIP = "49.13.150.177",
    [string]$User = "root",
    [string]$SshKey = ""
)

$DeployDir = "/opt/dmscode"
$ComposeFile = "docker-compose.hetzner.yml"
$LocalEnvFile = ".env.hetzner"

if ([string]::IsNullOrWhiteSpace($SshKey)) {
    $candidateEd25519 = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
    $candidateRsa = Join-Path $env:USERPROFILE ".ssh\id_rsa"
    if (Test-Path $candidateEd25519) {
        $SshKey = $candidateEd25519
    } else {
        $SshKey = $candidateRsa
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Hilfsfunktionen
# ═══════════════════════════════════════════════════════════════════════════════
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# ═══════════════════════════════════════════════════════════════════════════════
# Deployment Funktionen
# ═══════════════════════════════════════════════════════════════════════════════

function Test-Prerequisites {
    Write-Info "Prüfe Voraussetzungen..."
    
    if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
        Write-Err "SSH nicht gefunden. Bitte OpenSSH installieren."
        exit 1
    }
    
    if (-not (Test-Path $SshKey)) {
        Write-Err "SSH Key nicht gefunden: $SshKey"
        Write-Info "Erstelle mit: ssh-keygen -t rsa -b 4096"
        exit 1
    }
    
    Write-Info "Voraussetzungen erfuellt"
}

function Initialize-Server {
    Write-Info "Bereite Server vor..."
    ssh -i $SshKey "${User}@${HetznerIP}" "mkdir -p /opt/dmscode/backend /opt/dmscode/docker"
    Write-Info "Server vorbereitet"
}

function Send-Files {
    Write-Info "Uebertrage Dateien..."

    if (-not (Test-Path $ComposeFile)) {
        Write-Err "Compose Datei nicht gefunden: $ComposeFile"
        exit 1
    }

    if (-not (Test-Path "docker/nginx.hetzner.conf.template")) {
        Write-Err "Nginx template nicht gefunden: docker/nginx.hetzner.conf.template"
        exit 1
    }

    # Hetzner Compose + nginx template
    scp -i $SshKey $ComposeFile "${User}@${HetznerIP}:${DeployDir}/"
    scp -i $SshKey "docker/nginx.hetzner.conf.template" "${User}@${HetznerIP}:${DeployDir}/docker/"

    # Backend
    scp -i $SshKey -r "backend/ocr" "${User}@${HetznerIP}:${DeployDir}/backend/"
    scp -i $SshKey -r "backend/search" "${User}@${HetznerIP}:${DeployDir}/backend/"
    scp -i $SshKey -r "backend/tts" "${User}@${HetznerIP}:${DeployDir}/backend/"

    # Optional env file
    if (Test-Path $LocalEnvFile) {
        scp -i $SshKey $LocalEnvFile "${User}@${HetznerIP}:${DeployDir}/.env.hetzner"
        Write-Info "Env uebertragen: $LocalEnvFile"
    } else {
        Write-Warn "Keine $LocalEnvFile gefunden. Erzeuge Default .env.hetzner auf dem Server (ohne API-Key)."
        $remoteEnv = @(
            "DMS_SERVER_NAME=$HetznerIP",
            "DMS_API_KEY=",
            "EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            "DEFAULT_VOICE=de_DE-thorsten-low"
        ) -join "`n"
        $cmd = "cat > ${DeployDir}/.env.hetzner << 'ENVFILE'`n$remoteEnv`nENVFILE"
        ssh -i $SshKey "${User}@${HetznerIP}" $cmd
    }
    
    Write-Info "Dateien uebertragen"
}

function Start-Services {
    Write-Info "Starte Services..."
    ssh -i $SshKey "${User}@${HetznerIP}" "cd /opt/dmscode; docker compose -f $ComposeFile --env-file .env.hetzner down || true"
    ssh -i $SshKey "${User}@${HetznerIP}" "cd /opt/dmscode; docker compose -f $ComposeFile --env-file .env.hetzner up -d"
    Start-Sleep -Seconds 5
    ssh -i $SshKey "${User}@${HetznerIP}" "cd /opt/dmscode; docker compose -f $ComposeFile --env-file .env.hetzner ps"
    Write-Info "Services gestartet"
}

function Stop-Services {
    Write-Info "Stoppe Services..."
    ssh -i $SshKey "${User}@${HetznerIP}" "cd /opt/dmscode; docker compose -f $ComposeFile --env-file .env.hetzner down"
    Write-Info "Services gestoppt"
}

function Restart-Services {
    Write-Info "Starte Services neu..."
    ssh -i $SshKey "${User}@${HetznerIP}" "cd /opt/dmscode; docker compose -f $ComposeFile --env-file .env.hetzner restart"
    Write-Info "Services neugestartet"
}

function Get-Logs {
    ssh -i $SshKey "${User}@${HetznerIP}" "cd /opt/dmscode; docker compose -f $ComposeFile --env-file .env.hetzner logs --tail=100"
}

function Get-Status {
    Write-Info "Status der Services:"
    ssh -i $SshKey "${User}@${HetznerIP}" "cd /opt/dmscode; docker compose -f $ComposeFile --env-file .env.hetzner ps"
}

function Test-Health {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Service Health Check" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    
    $baseHost = $HetznerIP
    $apiKey = ""
    if (Test-Path $LocalEnvFile) {
        $content = Get-Content $LocalEnvFile -ErrorAction SilentlyContinue
        $serverLine = $content | Where-Object { $_ -match '^DMS_SERVER_NAME=' } | Select-Object -First 1
        if ($serverLine) { $baseHost = ($serverLine -split '=', 2)[1].Trim().Trim('"') }
        $keyLine = $content | Where-Object { $_ -match '^DMS_API_KEY=' } | Select-Object -First 1
        if ($keyLine) { $apiKey = ($keyLine -split '=', 2)[1].Trim().Trim('"') }
    }

    $headers = @{}
    if (-not [string]::IsNullOrWhiteSpace($apiKey)) {
        $headers["X-API-KEY"] = $apiKey
    }

    $checks = @(
        @{ Name = "Proxy Health"; Url = "http://${baseHost}/health" },
        @{ Name = "OCR Service"; Url = "http://${baseHost}/ocr/health" },
        @{ Name = "Search Service"; Url = "http://${baseHost}/search/health" },
        @{ Name = "TTS Service"; Url = "http://${baseHost}/tts/health" },
        @{ Name = "Ollama LLM"; Url = "http://${baseHost}/api/tags" }
    )

    foreach ($c in $checks) {
        try {
            $null = Invoke-RestMethod -Uri $c.Url -Headers $headers -TimeoutSec 10 -ErrorAction Stop
            Write-Host "  OK $($c.Name.PadRight(15)) : $($c.Url)" -ForegroundColor Green
        } catch {
            Write-Host "  XX $($c.Name.PadRight(15)) : NICHT ERREICHBAR" -ForegroundColor Red
        }
    }
    
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Install-LLM {
    Write-Info "Lade LLM Modell herunter (kann einige Minuten dauern)..."
    ssh -i $SshKey "${User}@${HetznerIP}" "docker exec dmscode-ollama ollama pull llama3.2"
    Write-Info "LLM Modell geladen"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Hauptprogramm
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DMSCode Backend Deployment fuer Hetzner" -ForegroundColor Cyan
Write-Host "  Server: $HetznerIP" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

switch ($Command) {
    "deploy" {
        Test-Prerequisites
        Initialize-Server
        Send-Files
        Start-Services
        Install-LLM
        Test-Health
    }
    "upload" {
        Test-Prerequisites
        Send-Files
    }
    "start" {
        Start-Services
    }
    "stop" {
        Stop-Services
    }
    "restart" {
        Restart-Services
    }
    "logs" {
        Get-Logs
    }
    "status" {
        Get-Status
        Test-Health
    }
    "health" {
        Test-Health
    }
}

Write-Host ""
Write-Info "Fertig!"
