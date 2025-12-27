# DMSCode - VS Code Insiders Extensions Installer
# Dieses Skript installiert alle empfohlenen Extensions für die DMS-Entwicklung

param(
    [switch]$UseStableVSCode = $false
)

$ErrorActionPreference = "Continue"

# VS Code Pfade
$InsidersPath = "$env:LOCALAPPDATA\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd"
$StablePath = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd"

if ($UseStableVSCode) {
    $CodePath = $StablePath
    $CodeName = "VS Code"
} else {
    $CodePath = $InsidersPath
    $CodeName = "VS Code Insiders"
}

# Prüfen ob VS Code installiert ist
if (-not (Test-Path $CodePath)) {
    Write-Host "❌ $CodeName nicht gefunden unter: $CodePath" -ForegroundColor Red
    Write-Host "Bitte installieren Sie $CodeName zuerst:" -ForegroundColor Yellow
    Write-Host "  winget install Microsoft.VisualStudioCode.Insiders" -ForegroundColor Cyan
    exit 1
}

Write-Host "✅ $CodeName gefunden" -ForegroundColor Green
Write-Host ""

# Liste der zu installierenden Extensions
$Extensions = @(
    # Entwicklung
    @{ Id = "dbaeumer.vscode-eslint"; Name = "ESLint" },
    @{ Id = "esbenp.prettier-vscode"; Name = "Prettier" },
    @{ Id = "ms-vscode.vscode-typescript-next"; Name = "TypeScript Nightly" },
    
    # Extension Development
    @{ Id = "ms-vscode.extension-test-runner"; Name = "Extension Test Runner" },
    
    # AI & Copilot
    @{ Id = "github.copilot"; Name = "GitHub Copilot" },
    @{ Id = "github.copilot-chat"; Name = "GitHub Copilot Chat" },
    
    # Git
    @{ Id = "eamodio.gitlens"; Name = "GitLens" },
    @{ Id = "mhutchie.git-graph"; Name = "Git Graph" },
    
    # Markdown
    @{ Id = "yzhang.markdown-all-in-one"; Name = "Markdown All in One" },
    @{ Id = "bierner.markdown-mermaid"; Name = "Markdown Mermaid" },
    
    # API & Testing
    @{ Id = "humao.rest-client"; Name = "REST Client" },
    
    # PDF
    @{ Id = "tomoki1207.pdf"; Name = "PDF Viewer" },
    
    # Docker
    @{ Id = "ms-azuretools.vscode-docker"; Name = "Docker" },
    
    # YAML & JSON
    @{ Id = "redhat.vscode-yaml"; Name = "YAML" },
    
    # Produktivität
    @{ Id = "usernamehw.errorlens"; Name = "Error Lens" },
    @{ Id = "gruntfuggly.todo-tree"; Name = "Todo Tree" },
    @{ Id = "aaron-bond.better-comments"; Name = "Better Comments" }
)

Write-Host "📦 Installiere $($Extensions.Count) Extensions..." -ForegroundColor Cyan
Write-Host ""

$installed = 0
$failed = 0

foreach ($ext in $Extensions) {
    Write-Host "  ⏳ $($ext.Name) ($($ext.Id))..." -NoNewline
    
    try {
        $result = & $CodePath --install-extension $ext.Id --force 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✅" -ForegroundColor Green
            $installed++
        } else {
            Write-Host " ⚠️ (möglicherweise bereits installiert)" -ForegroundColor Yellow
            $installed++
        }
    }
    catch {
        Write-Host " ❌ Fehler" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "📊 Zusammenfassung:" -ForegroundColor Cyan
Write-Host "   ✅ Installiert: $installed" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "   ❌ Fehlgeschlagen: $failed" -ForegroundColor Red
}
Write-Host ""
Write-Host "🚀 Starten Sie $CodeName und öffnen Sie das DMSCode-Projekt:" -ForegroundColor Yellow
Write-Host "   & '$CodePath' 'D:\Projekte\DMSCode'" -ForegroundColor Cyan
Write-Host ""
