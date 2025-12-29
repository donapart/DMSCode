# DMSCode Feature Roadmap

Stand: 2025-12-30

## 0) Kurzbild: Was DMSCode heute schon kann (Ist-Stand)

### VS Code Extension (Core)
- **Aktivierung & UI-Struktur**: Activitybar-Container + Views (Dokumente/Tags/Recent/Suche/Scanner) und Commands.
  - Quelle: `extension/src/extension.ts`, `extension/package.json`
- **Dokumentenablage lokal**: Scannt ein Dokumentenverzeichnis, baut daraus eine interne Dokumentliste (Cache in `dms-index.json`).
  - Quelle: `extension/src/services/DmsService.ts`
- **Dokumenten-Explorer**: TreeView listet Dokumente (aktuell flach, keine Ordner-Hierarchie).
  - Quelle: `extension/src/providers/DocumentsTreeProvider.ts`
- **Tags**: Tags pro Dokument (add/remove/rename/delete) werden im Cache gepflegt.
  - Quelle: `extension/src/services/DmsService.ts`, Commands in `extension/src/extension.ts`
- **Dashboard**: Webview mit Übersicht, Recent, Tag-Cloud und Quick Actions.
  - Quelle: `extension/src/views/DashboardPanel.ts`
- **Scanner/OCR Panel**: Datei auswählen (PDF/Bild), OCR triggern, Ergebnis anzeigen und als Text speichern.
  - Quelle: `extension/src/views/ScannerPanel.ts`
- **Semantische Suche Panel**: Query -> Service -> Ergebnisliste in Webview.
  - Quelle: `extension/src/views/SemanticSearchPanel.ts`
- **PDF Viewer (Custom Editor)**: PDF-Anzeige via pdf.js (lokal gebundled), Navigation/Zoom, OCR-Button.
  - Quelle: `extension/src/editors/PdfViewerProvider.ts`
- **AI Chat (Chat Participant)**: Befehle `search`, `summarize`, `extract`, general chat (LLM).
  - Quelle: `extension/src/chat/DmsAssistant.ts`, `extension/src/services/DmsService.ts`
- **Kalender Panel**: Termin-Events + Dokumente als Events (basierend auf `createdAt`), Speicherung von User-Events.
  - Quelle: `extension/src/views/CalendarPanel.ts`
- **TTS/STT (teilweise)**:
  - TTS: via externem HTTP-Service, spielt Audio via Default Player.
  - STT: vorgesehen via Webview (SpeechPanel) + optional Backend.
  - Quelle: `extension/src/views/SpeechPanel.ts`, `extension/src/services/DmsService.ts`
- **Import/Export**: Importiert Dateien/Ordner ins Dokumentenverzeichnis; Exportiert alle Dokumente in ein Zielverzeichnis.
  - Quelle: `extension/src/services/DmsService.ts`, Commands in `extension/src/extension.ts`

### Backend/Infra (aktuell im Repo vorhanden)
- **Docker Compose + Reverse Proxy**: Nginx als Einstiegspunkt (HTTP), Weiterleitung auf Services (LLM/OCR/Search).
  - Quelle: `extension/backend/docker-compose.yml`, `extension/backend/nginx.conf`
- **HTTPS Support (IONOS Zertifikat, manuell)**: Konfig + Setup-Skript für 443, SSL-Volume, Redirect.
  - Quelle: `extension/backend/nginx.https.conf`, `extension/backend/setup_https.sh`

## 1) Wichtige Lücken / Bugs (sollten vor Feature-Ausbau gefixt werden)

### P0 – Funktionalität/UX inkonsistent
- **Config-Mismatch Endpoints**: `extension/package.json` Defaults zeigen auf Produktion, aber `DmsService` nutzt noch `localhost` Defaults (bei fehlender User-Config).
  - Risiko: Extension nutzt je nach Maschine unerwartet falsche Endpoints.
- **Search Results View wird nicht befüllt**: `SearchResultsProvider` existiert, aber Webview-Suche schreibt keine Ergebnisse in den Tree.
  - Ergebnis: „Suchergebnisse“-View bleibt leer.
- **Tag-View Suche wahrscheinlich wirkungslos**: Tag-Tree ruft Suche mit `tag:<tag>` auf. Der lokale Fallback matcht Tags aber nur als „reiner“ Term; `tag:foo` matcht nicht.
  - Besser: eigene „ByTag“-Suche / Query-Parsing.
- **STT mögliche Endlosschleife**: `dms.speechToText` Command ruft `DmsService.speechToText()`; dessen Fallback triggert wiederum `dms.speechToText`.

### P1 – Stabilität/Kompatibilität
- **OCR Upload in Node**: Nutzung von `FormData`/`Blob` ohne Import kann je nach Node/VS Code Runtime brechen.
- **OCR Fallback Messaging**: Hinweise sprechen von `ocr-service`, Compose heißt aber `ocr`.
- **PDF Viewer CDN-Abhängigkeit**: pdf.js via CDN kann offline/behind-proxy scheitern und CSP/Compliance-Fragen auslösen.

### P2 – Security/Prod
- **Shared API Key / keine User-Auth**: Aktuell nur `X-API-KEY` (wenn gesetzt). Keine Rollen, keine Per-Doc ACL.
- **HTTPS Rollout**: Manuell möglich, aber noch nicht „one-shot“ in CI/CD integriert (und DNS/Cert-Chain muss sauber sein).

## 2) Roadmap (priorisiert, in Milestones)

### Milestone A – Stabilisierung (v0.2)
Ziel: „Alles was sichtbar ist, funktioniert zuverlässig“.

**A1. Konfiguration & Endpoints (P0)**
- [x] `DmsService` Defaults mit `package.json` Defaults vereinheitlichen.
- [x] Klare Fehlermeldungen pro Service (OCR/Search/LLM/TTS) inkl. „Test connection“ Command.

**A2. Suche & Views (P0)**
- [x] SemanticSearchPanel schreibt Ergebnisse zusätzlich in `SearchResultsProvider`.
- [x] Tag-Search: `tag:` Syntax unterstützen ODER Tag-Tree ruft `getDocumentsByTag(tag)` und zeigt Ergebnisse.
- [x] Einheitliche Ergebnisdarstellung (Snippet/Score/Quelle) in Webview + Tree.

**A3. STT Fix (P0)**
- [x] Kein rekursiver Fallback; klarer Flow: „Panel öffnen“ statt Command re-triggern.

**A4. PDF Viewer Hardening (P1)**
- [x] pdf.js lokal bundlen (keine CDN Abhängigkeit) oder robusten Fallback.
- [x] CSP sauber setzen (script-src) und Webview-Assets nur lokal.

**Definition of Done (für v0.2)**
- [x] Frische Installation: Dashboard, Scan/OCR, Suche, Tagging, PDF Viewer funktionieren ohne manuelle Debug-Schritte.
- [x] SearchResults-View zeigt Ergebnisse nach Suche.

### Milestone B – Produktivität (v0.3)
Ziel: echte DMS-Workflows schneller als „Explorer + Ordner“.

**B1. Metadaten & Tagging UX (P1)**
- [x] „Tag hinzufügen“ auch ohne Kontextitem: Dokumentauswahl per QuickPick.
- [x] Bulk-Operationen (multi-select): Tag auf N Dokumente, Remove, Rename.
- [x] Dokument-Details Panel (read-only): Pfad, Typ, Tags, OCR-Status, Index-Status.

**B2. OCR/Index Workflow (P1)**
- [x] „OCR + Index“ als 1 Command (Batch-fähig).
- [x] Hintergrund-Queue: Indexing nicht UI-blockierend, Progress + Retry.

**B3. Import/Export Verbesserungen (P2)**
- [x] Konfliktstrategie (überschreiben/umbenennen/skip) beim Import.
- [x] Export: optional nur Auswahl / nach Tag / nach Zeitraum.

### Milestone C – AI/RAG Mehrwert (v0.4)
Ziel: LLM-Features, die „DMS-spezifisch“ sind.

**C1. Assistant Tools (P1)**
- [x] `compare` implementieren: zwei Dokumente auswählen -> Vergleich (Diff-ähnlich) + Summary.
- [x] „Extrahiere Felder“ Templates: Rechnung (Betrag/Datum/IBAN), Vertrag (Laufzeit/Parteien), etc.

**C2. Kontextaufbau (P1)**
- [x] „Aktives Dokument + ähnliche Dokumente“ als Kontextquelle.
- [x] „Antwort mit Quellen“: Verlinke Dokument(e), aus denen die Antwort stammt.

### Milestone D – Team/Server-Ready (v0.5)
Ziel: Mehrbenutzer, sichere Ablage, Betrieb.

**D1. Auth & Security (P0/P1)**
- [ ] Auth-Story: mindestens per-user Token/JWT statt shared API key. (Entscheidung: Fokus auf Local-First + Portable Index)
- [ ] Rate limiting / request limits am Proxy.
- [ ] Secrets-Handling: keine Secrets im Repo, klare env-Konvention.

**D2. Storage/Indexing (P1)**
- [x] Persistente Ablage (Server) + definierte Backup/Restore-Prozedur. (Gelöst durch `dms-index.json` im Dokumentenordner)
- [x] Reindex-Command + Integrity Checks.

**D3. Observability (P2)**
- [x] Health/metrics pro Service, Logs zentral, simple „Diagnose“ UI. (Gelöst durch `dms.checkHealth`)

### Milestone E – v1.0 (Stabil + Polished)
Ziel: „tägliche Nutzung ohne Angst“.

- [ ] Dokument-Lifecycle: Import -> OCR -> Index -> Tagging -> Suche -> Export
- [ ] Robuste Fehlerbilder (ohne Silent Fails)
- [ ] Klare Doku: Setup (local + server), Troubleshooting, Backup

## 3) Features, die sich besonders gut über VS Code APIs ergänzen lassen

- **Command Palette Workflows**: „OCR + Index“, „Tag: …“, „Open recent“, „Export by tag“.
- **TreeView Power**: Multi-select + Context Menus + Drag&Drop (Import).
- **Custom Editor Erweiterungen**: PDF Annotations/Bookmarks, „Text aus Auswahl an Assistant“.
- **Chat Participant Tools**: Buttons für „Öffnen“, „Taggen“, „Als Aufgabe“.
- **Tasks Integration**: „docker compose up“, „Health check“, „Reindex“ als VS Code Tasks.

## 4) Empfehlungen (was ich als nächstes implementieren würde)

1. **Milestone A komplett** (P0-Bugs) – bringt sofort Vertrauen und reduziert Support.
2. **OCR+Index Batch Command** (B2) – macht den Workflow schnell.
3. **Compare + Field Extraction** (C1) – sichtbarer AI-Mehrwert.
4. **Auth-Entscheidung früh treffen** (D1) – sonst wird später alles teuer.

## 5) Visionäre Ergänzungen & Skalierung (Langfristig)

### 5.1 "Magic" AI Features (UX-Booster)
- [x] **Auto-Rename**: AI analysiert den Inhalt (z.B. "Rechnung vom 01.01.2024 von Telekom") und schlägt einen standardisierten Dateinamen vor (`2024-01-01_Rechnung_Telekom.pdf`).
- [x] **Auto-Tagging**: Beim Import/OCR schlägt das LLM automatisch Tags vor (basierend auf existierenden Tags und Inhalt).
- [x] **Chat with Document**: Rechtsklick auf Datei -> "Frage an Dokument stellen" (öffnet Chat mit diesem Dokument als exklusivem Kontext).

### 5.2 Technische Skalierung
- [x] **SQLite statt globalState**: `globalState` ist für kleine Mengen okay, wird aber bei >1000 Dokumenten langsam. Migration auf `vscode-sqlite` oder lokale JSON-DB. (Gelöst durch `dms-index.json`)
- [x] **File Watcher**: Statt manuellem "Refresh" sollte die Extension Änderungen im Dokumentenordner automatisch erkennen (`vscode.workspace.createFileSystemWatcher`).

### 5.3 Qualitätssicherung
- [ ] **Echte Integrationstests**: Die aktuellen Tests nutzen Mocks. Wir brauchen Tests, die echte Dateien anlegen, OCR simulieren und prüfen, ob Tags persistiert werden.
- [x] **CI/CD Pipeline**: Automatischer Build der `.vsix` Datei und Release auf GitHub bei jedem Tag. (Implementiert in `.github/workflows/build.yml`)

### 5.4 UX Polish (neu hinzugefügt)
- [x] **CHANGELOG.md**: Dokumentiert alle Änderungen nach Keep a Changelog Format.
- [x] **Keyboard Shortcuts**: Schnellzugriff (`Ctrl+Shift+D` Dashboard, `Ctrl+Shift+S` Suche, etc.).
- [x] **StatusBar Item**: Zeigt Dokumentenanzahl, klickbar für Dashboard.
- [x] **Welcome Message**: Begrüßung beim ersten Start mit Quick-Links.
- [x] **Walkthrough erweitert**: Neue Features und Tastenkürzel dokumentiert.

---

## Anhang: Offene Fragen (für die nächste Iteration)
- Soll das „Single-User local DMS“ bleiben oder „Server DMS für mehrere Geräte/Users“ werden?
- Wo sollen Originaldateien langfristig liegen (lokal, Server, S3/Azure, …)?
- Welche Dokumenttypen sind Priorität (Rechnung/Vertrag/…)?
