# DMSCode Backend auf Hetzner Server

## Server Details
- **IP:** 49.13.150.177
- **SSH:** `ssh root@49.13.150.177`
- **Docker:** 27.5.1
- **Docker Compose:** v2.32.4

## Laufende Services

| Service             | Port  | URL                        | Status          |
| ------------------- | ----- | -------------------------- | --------------- |
| **Ollama (LLM)**    | 11434 | http://49.13.150.177:11434 | ✅ Running       |
| **OCR**             | 8510  | http://49.13.150.177:8510  | ⚠️ Config needed |
| **Semantic Search** | 8520  | http://49.13.150.177:8520  | ✅ Running       |
| **TTS**             | 8505  | http://49.13.150.177:8505  | 🔲 Optional      |

## Installierte Modelle

### Ollama
- `llama3.2` (3B Parameter, ~2GB)

Um weitere Modelle zu installieren:
```bash
ssh root@49.13.150.177 "docker exec dmscode-ollama ollama pull mistral"
ssh root@49.13.150.177 "docker exec dmscode-ollama ollama pull codellama"
```

## VS Code Settings

Füge diese Einstellungen zu deinen VS Code Settings hinzu (`settings.json`):

```json
{
    "dms.llmProvider": "ollama",
    "dms.llmEndpoint": "http://49.13.150.177:11434",
    "dms.llmModel": "llama3.2",
    "dms.ocrEndpoint": "http://49.13.150.177:8510",
    "dms.semanticSearchEndpoint": "http://49.13.150.177:8520",
    "dms.ttsEndpoint": "http://49.13.150.177:8505"
}
```

## Docker Management

### Status prüfen
```bash
ssh root@49.13.150.177 "docker ps"
```

### Logs anzeigen
```bash
ssh root@49.13.150.177 "docker logs dmscode-ollama"
ssh root@49.13.150.177 "docker logs dmscode-semantic"
ssh root@49.13.150.177 "docker logs dmscode-ocr"
```

### Services neu starten
```bash
ssh root@49.13.150.177 "cd /root && docker compose restart"
```

### Services stoppen
```bash
ssh root@49.13.150.177 "cd /root && docker compose down"
```

### Services starten
```bash
ssh root@49.13.150.177 "cd /root && docker compose up -d"
```

## API Test

### Ollama testen
```bash
curl http://49.13.150.177:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Hallo, wie geht es dir?",
  "stream": false
}'
```

### Semantic Search Health Check
```bash
curl http://49.13.150.177:8520/health
```

## Firewall

Falls die Ports nicht erreichbar sind, öffne sie auf dem Server:
```bash
ssh root@49.13.150.177 "ufw allow 11434/tcp && ufw allow 8510/tcp && ufw allow 8520/tcp && ufw allow 8505/tcp"
```

## Ressourcen

- **RAM:** 16 GB
- **CPU:** Shared vCPU
- **Speicher:** 150 GB

Der Server ist gut dimensioniert für:
- Kleine bis mittlere LLM-Modelle (bis 7B Parameter)
- OCR-Verarbeitung
- Embedding-Generierung für Semantic Search
