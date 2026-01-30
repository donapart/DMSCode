# Changelog

Alle bemerkenswerten Änderungen an DMSCode werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [0.6.0] - 2026-01-30

### 🧠 GraphRAG - Knowledge Graph Integration
- **Graph-Service**: Neuer FastAPI Backend-Service mit SurrealDB für strukturierte Dokumenten-Graphen
  - Automatische Entity Extraction (Personen, Organisationen, Daten, Beträge, Produkte, Orte)
  - LLM-basierte Erkennung + Regex-Fallback
  - Speicherung von Entitäten und Beziehungen in Graph-Datenbank
- **Hybrid Retrieval**: Kombination aus Graph-Queries und Vector Search
  - Agent erkennt automatisch strukturierte Queries ("wer", "welche organisation", "verbindung")
  - Nutzt Knowledge Graph für strukturierte Informationen
  - Ergänzt mit semantischer Suche für umfassende Antworten
- **Graph Visualisierung**: Interaktives D3.js Panel
  - Force-directed Graph Layout
  - Color-coded Entity-Types
  - Drag & Drop, Zoom, Pan
  - Info Panel mit Entity-Details
- **Neue Commands**:
  - `DMS: Knowledge Graph anzeigen` - Visualisierung öffnen
  - `DMS: Entitäten extrahieren` - Entity Extraction für Dokument
- **Context-Menu Integration**: Rechtsklick auf Dokument → "Entitäten extrahieren"

### 🚀 Backend
- **SurrealDB Container**: Graph-Datenbank für Entitäten und Beziehungen
- **graph-service**: Port 8530, vollständige REST API für Graph-Operationen
- **Docker Integration**: Beide Compose-Files (local + hetzner) erweitert
- **Nginx Proxy Route**: `/graph/` → Graph-Service

### 📚 Dokumentation
- **GRAPHRAG.md**: Vollständige Übersicht über GraphRAG-Implementation
  - API Endpoints
  - Workflow-Beispiele
  - Deployment-Anleitung

## [0.5.0] - 2025-12-30

### 🚀 Neu hinzugefügt
- **Portable Index**: Metadaten werden jetzt in `dms-index.json` im Dokumentenordner gespeichert
  - Volle Portabilität: Ordner kopieren = alles ist dabei (Tags, Status, etc.)
  - Unabhängig von VS Code `globalState`
- **System Health Check**: Neuer Befehl `DMS: Systemstatus prüfen` zeigt Verbindungsstatus aller Services
- **Reindex All**: Befehl zum Neuaufbau des gesamten Index
- **Chat with Document**: Rechtsklick auf Dokument → "Chat mit Dokument" für kontextbezogene Fragen
- **Auto-Tagging (AI)**: KI schlägt automatisch passende Tags basierend auf Dokumentinhalt vor
- **Auto-Rename (AI)**: KI generiert standardisierte Dateinamen (z.B. `2024-01-15_Rechnung_Telekom.pdf`)
- **RAG-Integration**: `@dms` Chat nutzt jetzt Retrieval-Augmented Generation für bessere Antworten
- **StatusBar**: Zeigt Dokumentenanzahl und Systemstatus

### ✨ Verbessert
- **PDF Viewer**: Worker wird jetzt lokal geladen (keine CDN-Abhängigkeit mehr)
- **Bulk-Operationen**: Multi-Select in der Dokumentenliste für Massen-Tagging
- **Import mit Konfliktstrategie**: Wahl zwischen Überschreiben, Umbenennen oder Überspringen
- **Export mit Filter**: Export nach Tag oder Zeitraum möglich
- **Keyboard Shortcuts**: Schnellzugriff auf wichtige Funktionen

### 🐛 Behoben
- STT-Endlosschleife bei fehlendem Backend
- Tag-Suche mit `tag:` Präfix funktioniert jetzt korrekt
- SearchResultsView wird bei Suche befüllt
- Config-Defaults zwischen `package.json` und `DmsService` vereinheitlicht

## [0.4.0] - 2025-12-29

### 🚀 Neu hinzugefügt
- **Dokumentenvergleich**: Zwei Dokumente auswählen und KI-gestützt vergleichen
- **Datenextraktion**: Strukturierte Felder aus Dokumenten extrahieren (Rechnungsdaten, Vertragsdaten)
- **Document Details Panel**: Zeigt alle Metadaten eines Dokuments

### ✨ Verbessert
- Chat Participant `@dms` mit neuen Commands: `compare`, `extract`
- Bessere Fehlerbehandlung bei Service-Timeouts

## [0.3.0] - 2025-12-28

### 🚀 Neu hinzugefügt
- **Bulk-Tagging**: Tags auf mehrere Dokumente gleichzeitig anwenden
- **OCR + Index Batch**: Kombinierter Befehl für Massenverarbeitung
- **File Watcher**: Automatische Erkennung neuer Dateien im Dokumentenordner

### ✨ Verbessert
- Hintergrund-Queue für Indexierung (nicht mehr UI-blockierend)
- Progress-Anzeige bei langen Operationen

## [0.2.0] - 2025-12-27

### 🐛 Behoben
- Endpoint-Konfiguration vereinheitlicht
- STT-Fallback-Logik ohne Rekursion
- PDF Viewer CSP-Konfiguration

### ✨ Verbessert
- Semantische Suche schreibt in SearchResultsView
- Tag-Filter in der Suche

## [0.1.0] - 2025-12-20

### 🚀 Initiales Release
- Dokumenten-Explorer mit TreeView
- PDF Viewer (Custom Editor)
- Scanner & OCR Panel
- Semantische Suche
- AI Chat Participant (`@dms`)
- Dashboard mit Tag-Cloud
- Kalender-Ansicht
- Import/Export Funktionen
- TTS/STT Integration (experimentell)
