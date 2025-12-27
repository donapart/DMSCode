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

Für volle Funktionalität (OCR, Semantic Search, LLM):

```powershell
# Backend aus dem DMS-Projekt starten
cd D:\Projekte\DMS
docker-compose up -d
```

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
