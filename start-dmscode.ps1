# DMSCode Starter Script
# Startet VS Code Insiders mit der DMSCode Extension im Development-Modus

param(
    [switch]$Dev,           # Development-Modus (F5 equivalent)
    [switch]$Installed,     # Nutze installierte Extension
    [switch]$Backend,       # Starte auch Backend-Services
    [string]$Workspace = "" # Optional: Workspace-Pfad
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExtensionDir = Join-Path $ScriptDir "extension"
$DmsBackendDir = "D:\Projekte\DMS"

# Farben für Output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║           DMSCode - Document Management System            ║" -ForegroundColor Blue
Write-Host "║              VS Code Insiders Edition                     ║" -ForegroundColor Blue
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# Prüfe VS Code Insiders Installation
$vsCodeInsidersPath = "${env:LOCALAPPDATA}\Programs\Microsoft VS Code Insiders\Code - Insiders.exe"
$vsCodeInsiders = Get-Command "code-insiders" -ErrorAction SilentlyContinue

if (-not $vsCodeInsiders -and -not (Test-Path $vsCodeInsidersPath)) {
    Write-Warning "VS Code Insiders nicht gefunden!"
    Write-Info "Installation: winget install Microsoft.VisualStudioCode.Insiders"
    
    $install = Read-Host "Jetzt installieren? (j/n)"
    if ($install -eq "j") {
        winget install Microsoft.VisualStudioCode.Insiders
        Write-Success "VS Code Insiders installiert. Bitte Script neu starten."
        exit 0
    }
    exit 1
}

# Nutze vollständigen Pfad falls nicht im PATH
if (-not $vsCodeInsiders) {
    function code-insiders { & $vsCodeInsidersPath @args }
}

Write-Success "✓ VS Code Insiders gefunden"

# Backend-Services starten (optional)
if ($Backend) {
    Write-Info "Starte Backend-Services..."
    
    if (Test-Path (Join-Path $DmsBackendDir "docker-compose.yml")) {
        Push-Location $DmsBackendDir
        docker-compose up -d
        Pop-Location
        Write-Success "✓ Backend-Services gestartet"
        
        # Warte kurz auf Service-Start
        Write-Info "Warte auf Service-Initialisierung..."
        Start-Sleep -Seconds 5
    } else {
        Write-Warning "docker-compose.yml nicht gefunden in $DmsBackendDir"
    }
}

# Extension kompilieren falls nötig
$outDir = Join-Path $ExtensionDir "out"
if (-not (Test-Path $outDir) -or $Dev) {
    Write-Info "Kompiliere Extension..."
    Push-Location $ExtensionDir
    
    if (-not (Test-Path "node_modules")) {
        Write-Info "Installiere Dependencies..."
        npm install
    }
    
    npm run compile
    Pop-Location
    Write-Success "✓ Extension kompiliert"
}

# VS Code Insiders starten
if ($Dev) {
    # Development-Modus: Extension Development Host
    Write-Info "Starte VS Code Insiders im Development-Modus..."
    
    $launchArgs = @(
        "--extensionDevelopmentPath=$ExtensionDir"
    )
    
    if ($Workspace) {
        $launchArgs += $Workspace
    }
    
    & $vsCodeInsidersPath @launchArgs
    
} else {
    # Normaler Modus: Extension aus out/ laden
    Write-Info "Starte VS Code Insiders mit DMSCode Extension..."
    
    $launchArgs = @()
    
    # Workspace angeben falls vorhanden
    if ($Workspace) {
        $launchArgs += $Workspace
    } elseif (Test-Path $DmsBackendDir) {
        # Standard: DMS-Projekt öffnen
        $launchArgs += $DmsBackendDir
    }
    
    & $vsCodeInsidersPath @launchArgs
}

Write-Host ""
Write-Success "═══════════════════════════════════════════════════════════"
Write-Success "DMSCode gestartet!"
Write-Host ""
Write-Info "Tastenkürzel:"
Write-Host "  Ctrl+Shift+P  → Command Palette (suche 'DMS:')"
Write-Host "  @dms          → AI Chat mit DMS Assistant"
Write-Host ""
Write-Info "Wichtige Befehle:"
Write-Host "  DMS: Dashboard öffnen"
Write-Host "  DMS: Semantische Suche"
Write-Host "  DMS: Dokument scannen"
Write-Host ""

if ($Backend) {
    Write-Info "Backend-Services:"
    Write-Host "  Ollama:        http://localhost:11434"
    Write-Host "  OCR-Service:   http://localhost:8510"
    Write-Host "  Search-Service: http://localhost:8520"
    Write-Host "  TTS-Service:   http://localhost:8505"
}
