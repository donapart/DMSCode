# DMSCode - Vollständiges Setup-Skript
# Führt alle notwendigen Schritte für die Entwicklungsumgebung aus

param(
    [switch]$SkipVSCodeInstall = $false,
    [switch]$SkipExtensions = $false,
    [switch]$SkipNpm = $false
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         DMSCode - Entwicklungsumgebung Setup          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. VS Code Insiders installieren
if (-not $SkipVSCodeInstall) {
    Write-Host "📥 Schritt 1: VS Code Insiders prüfen..." -ForegroundColor Yellow
    
    $InsidersExe = "$env:LOCALAPPDATA\Programs\Microsoft VS Code Insiders\Code - Insiders.exe"
    
    if (Test-Path $InsidersExe) {
        Write-Host "   ✅ VS Code Insiders bereits installiert" -ForegroundColor Green
    } else {
        Write-Host "   ⏳ Installiere VS Code Insiders..." -ForegroundColor Cyan
        winget install Microsoft.VisualStudioCode.Insiders --accept-package-agreements --accept-source-agreements
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ VS Code Insiders installiert" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Installation fehlgeschlagen" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host ""
}

# 2. NPM Dependencies installieren
if (-not $SkipNpm) {
    Write-Host "📦 Schritt 2: NPM Dependencies installieren..." -ForegroundColor Yellow
    
    Push-Location "$ProjectRoot\extension"
    try {
        npm install 2>&1 | Out-Null
        Write-Host "   ✅ Dependencies installiert" -ForegroundColor Green
    }
    catch {
        Write-Host "   ❌ npm install fehlgeschlagen: $_" -ForegroundColor Red
    }
    finally {
        Pop-Location
    }
    Write-Host ""
}

# 3. TypeScript kompilieren
Write-Host "🔨 Schritt 3: TypeScript kompilieren..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\extension"
try {
    npm run compile 2>&1 | Out-Null
    Write-Host "   ✅ Kompilierung erfolgreich" -ForegroundColor Green
}
catch {
    Write-Host "   ⚠️ Kompilierung hatte Warnungen" -ForegroundColor Yellow
}
finally {
    Pop-Location
}
Write-Host ""

# 4. Extensions installieren
if (-not $SkipExtensions) {
    Write-Host "🔌 Schritt 4: VS Code Extensions installieren..." -ForegroundColor Yellow
    & "$ProjectRoot\scripts\install-extensions.ps1"
}

# 5. Projekt in VS Code Insiders öffnen
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""
Write-Host "🎉 Setup abgeschlossen!" -ForegroundColor Green
Write-Host ""
Write-Host "Nächste Schritte:" -ForegroundColor Yellow
Write-Host "  1. Öffnen Sie das Projekt in VS Code Insiders:" -ForegroundColor White
Write-Host "     code-insiders D:\Projekte\DMSCode" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Drücken Sie F5 um die Extension zu starten" -ForegroundColor White
Write-Host ""
Write-Host "  3. Konfigurieren Sie den Dokumentenpfad in den Einstellungen:" -ForegroundColor White
Write-Host "     dms.documentsPath = 'Ihr/Dokumenten/Pfad'" -ForegroundColor Cyan
Write-Host ""

# Optional: VS Code Insiders direkt öffnen
$openNow = Read-Host "Möchten Sie VS Code Insiders jetzt öffnen? (j/N)"
if ($openNow -eq "j" -or $openNow -eq "J") {
    $InsidersPath = "$env:LOCALAPPDATA\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd"
    if (Test-Path $InsidersPath) {
        & $InsidersPath $ProjectRoot
    }
}
