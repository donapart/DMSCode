# DMSCode - Setup-Anleitung

## 🚀 Schnellstart (Automatisch)

```powershell
# Vollständiges Setup ausführen
.\scripts\setup-dev-environment.ps1
```

## 📥 VS Code Insiders Installation

```powershell
# Windows (winget)
winget install Microsoft.VisualStudioCode.Insiders

# Oder manueller Download:
# https://code.visualstudio.com/insiders/
```

## 🔌 Empfohlene Extensions installieren

```powershell
# Alle empfohlenen Extensions installieren
.\scripts\install-extensions.ps1
```

### Installierte Extensions

| Extension | Beschreibung |
|-----------|--------------|
| ESLint | JavaScript/TypeScript Linting |
| Prettier | Code-Formatierung |
| GitHub Copilot | AI-Unterstützung |
| GitLens | Erweiterte Git-Features |
| Docker | Container-Management |
| Error Lens | Inline-Fehleranzeige |
| Todo Tree | TODO-Verwaltung |
| YAML | YAML-Support |

## 🛠️ Extension entwickeln und testen

```powershell
# In das Extension-Verzeichnis wechseln
cd D:\Projekte\DMSCode\extension

# Dependencies installieren
npm install

# TypeScript kompilieren (watch mode)
npm run watch

# In VS Code Insiders:
# 1. Öffne den DMSCode-Ordner
# 2. Drücke F5 zum Starten des Extension Development Host
```

## Backend-Services (optional)

### Option 1: Lokal (Entwicklung)

Für volle Funktionalität (OCR, Semantic Search, LLM):

```powershell
# Backend-Services lokal starten
cd D:\Projekte\DMSCode
docker-compose up -d
```

### Option 2: Hetzner VPS (Produktion)

Deploye das Backend auf einen Hetzner-Server für Remote-Zugriff:

#### Vorbereitung

1. **Env-Datei erstellen**
```bash
cp .env.hetzner.example .env.hetzner
```

2. **.env.hetzner anpassen**
```bash
DMS_SERVER_NAME=api.example.com  # Deine Domain oder Server-IP
DMS_API_KEY=your-secret-key-here  # Optional: API-Key-Schutz
EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
DEFAULT_VOICE=de_DE-thorsten-low
```

3. **SSH-Key bereitstellen**
```bash
# Linux/macOS: ~/.ssh/id_rsa oder ~/.ssh/id_ed25519
# Windows: %USERPROFILE%\.ssh\id_rsa
# Falls nicht vorhanden:
ssh-keygen -t ed25519 -C "your@email.com"
ssh-copy-id root@your-server-ip
```

#### Deployment

**Linux/macOS:**
```bash
./deploy-hetzner.sh deploy
```

**Windows (PowerShell):**
```powershell
.\deploy-hetzner.ps1 -Command deploy -HetznerIP "49.13.150.177"
```

Das Skript:
- Installiert Docker + Docker Compose auf dem Server (falls nicht vorhanden)
- Überträgt alle Backend-Dateien + Docker-Compose-Konfiguration
- Startet nginx als Reverse Proxy (nur Port 80 exponiert)
- Lädt Ollama LLM-Modell herunter
- Führt Health-Checks durch

#### Nach dem Deployment

**Testen:**
```bash
curl http://your-server-ip/health
curl http://your-server-ip/ocr/health
curl http://your-server-ip/search/health
```

**VS Code Extension konfigurieren:**
```json
{
  "dms.llmEndpoint": "http://your-server-ip",
  "dms.ocrEndpoint": "http://your-server-ip/ocr",
  "dms.semanticSearchEndpoint": "http://your-server-ip/search",
  "dms.apiKey": "your-secret-key-here"
}
```

#### Weitere Befehle

```bash
# Status prüfen
./deploy-hetzner.sh status

# Logs anzeigen
./deploy-hetzner.sh logs

# Services neu starten
./deploy-hetzner.sh restart

# Services stoppen
./deploy-hetzner.sh stop
```

**Wichtig:** Der Hetzner-Deploy nutzt `docker-compose.hetzner.yml` (nginx als Container, Services intern, nur Port 80 offen). Für lokale Entwicklung bleibt `docker-compose.yml` unberührt (alle Ports exponiert).

## Empfohlene VS Code Insiders Einstellungen

```json
{
  "dms.documentsPath": "D:\\Dokumente\\DMS",
  "dms.llmProvider": "ollama",
  "dms.llmEndpoint": "http://localhost:11434",
  "dms.llmModel": "llama3.2",
  "dms.ocrLanguage": "deu+eng",
  "dms.enableSemanticSearch": true
}
```

## Roadmap

### Phase 1: Core Extension ✅
- [x] Extension-Struktur
- [x] Activity Bar mit DMS Views
- [x] Documents TreeView
- [x] Dashboard Webview
- [x] PDF Viewer (Custom Editor)
- [x] Scanner Panel
- [x] Semantic Search Panel
- [x] Chat Participant (@dms)

### Phase 2: Backend Integration 🔲
- [ ] OCR Service Integration
- [ ] Semantic Search Service
- [ ] LLM Provider Abstraction
- [ ] TTS/STT Integration

### Phase 3: Advanced Features 🔲
- [ ] Kalender mit Terminen
- [ ] Auto-Tagging
- [ ] Workflow Automation
- [ ] Multi-User Support

### Phase 4: Distribution 🔲
- [ ] Extension Marketplace Publishing
- [ ] Custom VS Code Distribution
- [ ] Portable Package
