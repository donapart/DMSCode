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

## 📦 Features

| Feature                 | Status | Beschreibung                                               |
| ----------------------- | ------ | ---------------------------------------------------------- |
| **Dokumenten-Explorer** | ✅      | TreeView mit Dokumenten, Tags und Suchergebnissen.         |
| **PDF Viewer**          | ✅      | Integrierter PDF-Viewer (pdf.js) mit OCR-Button.           |
| **OCR Scanner**         | ✅      | Texterkennung für Bilder und PDFs (Tesseract/LLM).         |
| **Semantic Search**     | ✅      | Suche nach Bedeutung statt nur Keywords (RAG).             |
| **AI Chat (@dms)**      | ✅      | Chat mit Dokumenten, Zusammenfassungen, Extraktion.        |
| **Auto-Tagging**        | ✅      | KI schlägt Tags basierend auf Inhalt vor.                  |
| **Portable Index**      | ✅      | Metadaten liegen in `dms-index.json` direkt beim Dokument. |
| **Kalender**            | ✅      | Zeitliche Übersicht der Dokumente.                         |
| **Dashboard**           | ✅      | Übersicht über letzte Dokumente und Tag-Cloud.             |

## 🌟 Highlights

### Portable Index (`dms-index.json`)
DMSCode speichert alle Metadaten (Tags, OCR-Status, Beschreibungen) in einer `dms-index.json` Datei direkt in Ihrem Dokumentenordner.
- **Vorteil**: Sie können den Ordner auf einen anderen PC kopieren oder synchronisieren (Dropbox, OneDrive), und alle Tags bleiben erhalten.
- **Kein Lock-in**: Die Daten gehören Ihnen, nicht der Extension.

### AI & RAG Integration
Nutzen Sie `@dms` im Chat, um mit Ihren Dokumenten zu interagieren:
- **Chat with Document**: Rechtsklick auf eine Datei -> "Chat with Document".
- **Auto-Tagging**: Lassen Sie die KI passende Tags vorschlagen.
- **Data Extraction**: Extrahieren Sie strukturierte Daten (Rechnungsnummer, Datum) aus PDFs.

### Health & Maintenance
- **Health Check**: Prüfen Sie die Verbindung zu allen Services (OCR, LLM, Search) mit `DMS: Check System Health`.
- **Reindex**: Reparieren oder aktualisieren Sie den Index jederzeit mit `DMS: Reindex All Documents`.

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

| Web-Component   | VS Code Equivalent                |
| --------------- | --------------------------------- |
| Activity Bar    | Extension contributes activitybar |
| Sidebar Views   | TreeView Provider                 |
| Editor Tabs     | Custom Editor Provider            |
| Panel           | Output Channel / Webview Panel    |
| Status Bar      | StatusBarItem API                 |
| Context Menu    | contributes.menus                 |
| Command Palette | contributes.commands              |
| Settings        | contributes.configuration         |
