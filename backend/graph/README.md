# Graph Service - DMSCode Knowledge Graph

Extracts entities and relationships from documents and stores them in SurrealDB.

## Features

- Entity extraction (Person, Organization, Date, Amount, Product, Location)
- Relationship mapping (works_for, mentions, issued_by, refers_to)
- Graph queries for hybrid RAG
- Schema evolution through LLM feedback

## API Endpoints

### Health Check
```
GET /health
```

### Extract Entities from Document
```
POST /extract
{
  "doc_id": "doc123",
  "text": "Invoice from Telekom GmbH dated 2024-01-15 for €99.99",
  "metadata": {
    "filename": "invoice.pdf",
    "tags": ["invoice", "telekom"]
  }
}
```

### Query Graph
```
POST /query
{
  "query": "RELATE documents WHERE mentions->organization.name = 'Telekom'",
  "params": {}
}
```

### Get Document Graph
```
GET /graph/{doc_id}
```

### Get Entity by Type
```
GET /entities/{entity_type}?limit=50
```
