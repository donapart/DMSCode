# DMSCode Architecture v2.0 - Platform Evolution

Mit der Einführung von **Automation** und **Web-Client** entwickelt sich DMSCode von einer reinen VS Code Extension zu einer **DMS-Plattform**.

## Übersicht

```mermaid
graph TD
    subgraph Clients
        VSCode[VS Code Extension]
        WebApp[Web / Mobile App (Next.js)]
    end

    subgraph "Docker / Server Infrastructure"
        ReverseProxy[Nginx Proxy]
        
        subgraph "Core Services"
            DmsCore[DMS Core API (Python)]
            Automation[Automation Engine (Python)]
        end
        
        subgraph "Intelligence Services"
            Ocr[OCR Service]
            Search[Semantic Search Service]
            Graph[Graph Service]
            LLM[Ollama LLM]
        end
        
        subgraph Data
            FS[Local Cache / Temp]
            Index[dms-index.json]
            VectorDB[ChromaDB]
            GraphDB[SurrealDB]
            Redis[Redis Cache]
            S3[MinIO Object Storage]
        end
    end

    VSCode --> ReverseProxy
    WebApp --> ReverseProxy
    
    ReverseProxy --> DmsCore
    ReverseProxy --> Automation
    ReverseProxy --> Intelligence Services
    ReverseProxy --> S3
    
    DmsCore --> S3
    DmsCore --> Index
    
    Automation --> DmsCore
    Automation --> Intelligence Services
```

## Data Strategy: "Code vs. Content" Separation

Um Privatsphäre und Datensicherheit zu maximieren, trennen wir Code und Daten physisch.

1.  **GitHub (Code-Repository)**
    *   Enthält NUR den Quellcode (`extension/`, `backend/`, Konfiguration).
    *   **Keine** Dokumente, keine Datenbank-Dumps.
    *   Kann öffentlich oder privat sein, ohne Datenschutzrisiko.

2.  **Hetzner Server (Daten-Tresor)**
    *   Hier laufen die Dienste in Docker.
    *   **MinIO (S3)**: Speichert alle Original-Dokumente (`PDF`, `PNG`, etc.).
        *   Bucket `archive`: Unveränderliche Originale (WORM-Schutz möglich).
        *   Bucket `processing`: Temporäre Dateien für OCR/Pipeline.
    *   **Volumes**: Persistente Daten liegen auf dem Server (z.B. `/mnt/dms_data`), getrennt vom Code.

## Milestone G: DMS Automate (Workflow Engine)

Wir implementieren eine **Low-Code Workflow Engine** direkt in VS Code.

### Komponenten
1.  **Flow Editor (Frontend)**: 
    - Custom Editor in VS Code für `.dmsflow` Dateien.
    - Tech: React Flow (Nodes & Edges).
    - Ermöglicht visuelles Zusammenklicken von Regeln.
2.  **Automation Engine (Backend)**:
    - Ein neuer Microservice (`automation-service`).
    - Lauscht auf Events (via Redis Pub/Sub oder Webhooks).
    - Führt die Logik aus (Python).

### Beispiel-Flow
*   **Trigger**: `OnImport`
*   **Node 1 (Condition)**: `Entity('total_amount') > 1000`
*   **Node 2 (LLM)**: "Prüfe ob Unterschrift vorhanden ist"
*   **Node 3 (Action)**: Sende E-Mail an "Chef" UND verschiebe in Ordner "Freigabe".

## Milestone H: DMS Anywhere (Web/Mobile)

Um das DMS ohne VS Code nutzbar zu machen (z.B. am Handy), brauchen wir eine eigenständige Web-Oberfläche.

### Herausforderung: "Single Source of Truth"
Aktuell verwaltet die VS Code Extension die `dms-index.json`. Wenn eine Web App dazu kommt, dürfen nicht zwei System gleichzeitig in die Datei schreiben (Race Conditions).

**Lösung: `dms-core` Service**
- Wir kapseln den Zugriff auf das Dateisystem und `dms-index.json` in einen Python FastAPI Service (`backend/core`).
- **VS Code** wird "dümmer": Statt direkt Dateien zu schreiben, ruft es (optional) die API auf.
- **Web App** nutzt ausschließlich diese API.

### Tech Stack Web App
- **Framework**: Next.js (React) - bietet SSR und gute Performance.
- **UI Lib**: Shadcn UI / Tailwind CSS (modern, clean, passt zum VS Code Look).
- **Features**:
  - PWA Support (installierbar auf iOS/Android).
  - Kamera-Integration für Beleg-Upload.

## Implementierungs-Reihenfolge

1.  **DmsCore Service erstellen** (`backend/core`): Kapselt Lese-/Schreibzugriff auf Index.
2.  **Automation Service erstellen** (`backend/automation`): Basis für Flows.
3.  **VS Code Flow Editor**: UI für Flows.
4.  **Web App Skeleton**: Next.js Setup.
