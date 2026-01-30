# GraphRAG Implementation - DMSCode v0.6.0

## Übersicht

Implementierung eines **Knowledge Graph Systems** für DMSCode zur strukturierten Erfassung von Entitäten und Beziehungen aus Dokumenten.

## Komponenten

### 1. Backend (graph-service)
- **FastAPI Service**: Port 8530
- **SurrealDB**: Graph-Datenbank für Entitäten und Beziehungen
- **LLM Entity Extraction**: Ollama extrahiert Entitäten (Person, Organisation, Datum, Betrag, Produkt, Ort)
- **Fallback Extraction**: Regex-basierte Extraktion als Fallback

### 2. Extension (DmsService)
Neue Methoden:
- `extractEntitiesFromDocument(docId)`: Extrahiert Entitäten aus Dokument
- `queryKnowledgeGraph(query)`: SurrealQL Query auf Graph
- `getDocumentGraph(docId)`: Vollständiger Graph für Dokument

### 3. Chat Assistant (DmsAssistant)
- **Hybrid Retrieval**: Kombination aus Graph-Queries und Vector Search
- **Smart Routing**: Erkennt strukturierte Queries (wer, welche, Verbindung)
- **Context Enrichment**: Graph-Informationen ergänzen Vector-RAG

### 4. UI (GraphVisualizationPanel)
- **D3.js Visualisierung**: Interaktiver Graph mit Nodes und Links
- **Drag & Drop**: Nodes verschiebbar
- **Zoom & Pan**: Flexible Navigation
- **Entity-Type Colors**: Farbkodierung nach Entitäts-Typ
- **Info Panel**: Details zu ausgewählten Nodes

## Docker Setup

### docker-compose.yml
```yaml
surrealdb:
  image: surrealdb/surrealdb:latest
  ports: ["8000:8000"]
  command: start --user root --pass root file:/data/database.db

graph-service:
  build: ./backend/graph
  ports: ["8530:8530"]
  depends_on: [surrealdb, ollama]
```

### docker-compose.hetzner.yml
- Gleiche Services, aber ohne Port-Exposé (nur intern)
- Nginx Proxy Route: `/graph/` → `http://graph-service:8530`

## VS Code Commands

### Neue Commands
- `dms.showKnowledgeGraph`: Visualisierung öffnen
- `dms.extractEntities`: Entitäten aus Dokument extrahieren

### Context-Menu Integration
- Rechtsklick auf Dokument → "Entitäten extrahieren"
- Nach Extraktion: Option zur Graph-Visualisierung

## API Endpoints

### Graph Service

#### POST /extract
```json
{
  "doc_id": "doc123",
  "text": "Invoice from Telekom...",
  "metadata": {"filename": "invoice.pdf", "tags": ["invoice"]}
}
```
→ Extrahiert Entitäten und speichert in Graph

#### POST /query
```json
{
  "query": "SELECT * FROM entity WHERE type = 'organization'",
  "params": {}
}
```
→ Führt SurrealQL Query aus

#### GET /graph/{doc_id}
→ Vollständiger Graph (Entitäten + Beziehungen) für Dokument

#### GET /entities/{type}?limit=50
→ Alle Entitäten eines Typs

## Workflow

1. **Dokument importieren** → OCR → Index
2. **Entitäten extrahieren** (`dms.extractEntities`)
   - LLM analysiert OCR-Text
   - Extrahiert Entitäten (Person, Org, Datum, etc.)
   - Speichert in SurrealDB Graph
3. **Chat-Anfrage** mit strukturierten Keywords
   - Agent erkennt Graph-Query-Bedarf
   - Führt Graph-Query aus
   - Kombiniert mit Vector-Search
   - Generiert Antwort mit beiden Kontexten
4. **Graph visualisieren** (`dms.showKnowledgeGraph`)
   - Zeigt Entitäten und Beziehungen
   - Interaktive D3.js Visualisierung

## Beispiel

**Dokument**: Rechnung von Telekom, 99,99 EUR, 15.01.2024

**Extrahierte Entitäten**:
- Organization: "Telekom GmbH"
- Amount: "99,99 EUR"
- Date: "2024-01-15"

**Beziehungen**:
- Document → mentions → Organization
- Organization → issued_by → Document

**Chat-Query**: "Welche Organisationen sind in meinen Dokumenten?"
- Agent: Graph-Query auf `entity WHERE type = 'organization'`
- Antwort: "Telekom GmbH (aus invoice.pdf)"

## Next Steps (Roadmap)

- [ ] Schema Evolution durch LLM-Feedback
- [ ] Beziehungs-Typen erweitern (works_for, located_in, etc.)
- [ ] Multi-Document Graph (globaler Graph über alle Docs)
- [ ] Graph-Export (JSON, Cypher)
- [ ] Advanced Queries (Traversal, Pattern Matching)
