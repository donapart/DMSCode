# DMSCode als Custom VS Code Distribution

## 🎯 Das Ziel

VS Code Insiders so anpassen, dass es **out-of-the-box** als DMS funktioniert.

## Optionen

### Option A: Extension Pack (Einfachster Weg)

Erstelle ein Extension Pack, das:
1. Die DMSCode Extension enthält
2. Empfohlene Extensions bündelt
3. Standard-Einstellungen mitliefert

```json
// package.json für Extension Pack
{
  "name": "dmscode-pack",
  "displayName": "DMSCode Complete Pack",
  "extensionPack": [
    "dmscode.dmscode",
    "ms-azuretools.vscode-docker",
    "github.copilot",
    "tomoki1207.pdf"
  ]
}
```

### Option B: Portable VS Code mit Preset

```powershell
# portable-dmscode.ps1

# 1. VS Code Insiders Portable herunterladen
$vsCodeUrl = "https://code.visualstudio.com/sha/download?build=insider&os=win32-x64-archive"
Invoke-WebRequest -Uri $vsCodeUrl -OutFile "vscode-insiders.zip"

# 2. Entpacken
Expand-Archive "vscode-insiders.zip" -DestinationPath "DMSCode-Portable"

# 3. data-Ordner erstellen (macht es portable)
New-Item -ItemType Directory -Path "DMSCode-Portable\data"

# 4. Extensions vorinstallieren
$extensionsPath = "DMSCode-Portable\data\extensions"
# DMSCode Extension hier ablegen

# 5. Settings kopieren
Copy-Item "default-settings.json" -Destination "DMSCode-Portable\data\user-data\User\settings.json"
```

### Option C: Custom VS Code Build (Aufwändig)

Fork von VS Code mit angepasstem:
- Branding (Logo, Name)
- Default Extensions
- Eingebauten DMS-Features
- Entfernten unnötigen Features

```bash
# VS Code Fork bauen
git clone https://github.com/microsoft/vscode.git dmscode-fork
cd dmscode-fork

# Branding ändern
# product.json anpassen

# Build
yarn
yarn compile
yarn gulp vscode-win32-x64
```

## 🏆 Empfehlung

**Für den Start: Option A (Extension Pack)**

1. Geringster Aufwand
2. Einfache Updates
3. Nutzt VS Code Marketplace
4. Benutzer behalten VS Code Flexibilität

**Später bei Bedarf: Option B (Portable)**

Für Unternehmen/Offline-Nutzung.

## Konkrete Umsetzung

### 1. Extension Pack erstellen

```
DMSCode/
├── extension/          # Haupt-Extension (bereits erstellt)
└── extension-pack/     # Pack mit allen Dependencies
    └── package.json
```

### 2. DMSCode Launcher (Windows)

```batch
@echo off
REM DMSCode.bat - Startet VS Code Insiders mit DMS
"C:\Users\%USERNAME%\AppData\Local\Programs\Microsoft VS Code Insiders\Code - Insiders.exe" ^
  --enable-proposed-api dmscode.dmscode ^
  --extensions-dir "%~dp0extensions" ^
  --user-data-dir "%~dp0user-data" ^
  %*
```

### 3. Docker-basiertes Portable Package

```dockerfile
# Dockerfile für DMSCode
FROM mcr.microsoft.com/vscode/devcontainers/base:ubuntu

# VS Code Server installieren
RUN curl -fsSL https://code-server.dev/install.sh | sh

# DMSCode Extension installieren
RUN code-server --install-extension dmscode.dmscode

# Backend-Services
COPY docker-compose.backend.yml /app/
# ...
```
