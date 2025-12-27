# DMSCode - Document Management System als VS Code Extension

> **Vision:** VS Code Insiders wird zum vollständigen Document Management System (DMS)

## 🎯 Konzept

Statt eine separate Web-UI zu pflegen, nutzen wir **VS Code Insiders als Host-Plattform** für alle DMS-Funktionen. Die gesamte DMS-Funktionalität wird als **VS Code Extension(s)** implementiert.

## 🏗️ Architektur-Optionen

### Option 1: VS Code Extension (Empfohlen)
```
DMSCode/
├── extension/              # Haupt-Extension
│   ├── src/
│   │   ├── extension.ts    # Entry Point
│   │   ├── views/          # Custom Webview Panels
│   │   ├── providers/      # Tree Data Providers
│   │   └── services/       # Backend-Services
│   └── package.json        # Extension Manifest
├── webviews/               # React/Svelte Webviews für komplexe UI
└── backend/                # Python/Node Microservices
```

### Option 2: Custom VS Code Distribution (Komplexer)
Eigener Fork von VS Code mit eingebauten DMS-Features.

## 📦 Geplante Features als VS Code Extension

| Feature | VS Code API | Status |
|---------|-------------|--------|
| **Dokumenten-Explorer** | TreeView API | 🔲 |
| **PDF Viewer** | Custom Editor API | 🔲 |
| **OCR Scanner** | Webview API | 🔲 |
| **Semantic Search** | Search Provider API | 🔲 |
| **AI Chat (RAG)** | Chat Participant API | 🔲 |
| **TTS/STT** | Webview + External Service | 🔲 |
| **Kalender** | Webview Panel | 🔲 |
| **Dashboard** | Webview Panel | 🔲 |

## 🚀 Quick Start

```powershell
# 1. VS Code Insiders installieren
winget install Microsoft.VisualStudioCode.Insiders

# 2. Extension Development Host starten
cd extension
npm install
npm run watch
# F5 drücken in VS Code
```

## 🔧 Warum VS Code Insiders?

1. **Neueste APIs** - Chat Participant API, Language Model API
2. **Frühzugriff** - Neue Features 2-4 Wochen früher
3. **Extension Testing** - Parallel zu Stable installierbar
4. **Native Performance** - Electron-basiert, kein Browser-Overhead

## 📚 Relevante VS Code APIs

- **TreeView API** - Dokumentenliste, Ordnerstruktur
- **Custom Editor API** - PDF/Image Viewer
- **Webview API** - Komplexe UI (Dashboard, Scanner)
- **Chat Participant API** - AI-Integration (Copilot-Style)
- **Language Model API** - LLM-Zugriff
- **FileSystem Provider** - Virtuelle Dateisysteme
- **Search Provider** - Custom Search
- **Authentication Provider** - Login/OAuth

## 🗂️ Migration von Web-DMS zu VS Code Extension

Das bestehende DMS (vscode_style_ui.html) wird schrittweise migriert:

| Web-Component | VS Code Equivalent |
|---------------|-------------------|
| Activity Bar | Extension contributes activitybar |
| Sidebar Views | TreeView Provider |
| Editor Tabs | Custom Editor Provider |
| Panel | Output Channel / Webview Panel |
| Status Bar | StatusBarItem API |
| Context Menu | contributes.menus |
| Command Palette | contributes.commands |
| Settings | contributes.configuration |
