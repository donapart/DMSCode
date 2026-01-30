"""
Graph Service for DMSCode
Manages knowledge graph of documents using SurrealDB
"""
import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx
from surrealdb import Surreal

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
SURREALDB_URL = os.getenv("SURREALDB_URL", "ws://surrealdb:8000/rpc")
SURREALDB_NS = os.getenv("SURREALDB_NS", "dmscode")
SURREALDB_DB = os.getenv("SURREALDB_DB", "knowledge")
SURREALDB_USER = os.getenv("SURREALDB_USER", "root")
SURREALDB_PASS = os.getenv("SURREALDB_PASS", "root")

app = FastAPI(title="DMSCode Graph Service", version="0.1.0")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global SurrealDB connection
db: Optional[Surreal] = None


# Pydantic Models
class Entity(BaseModel):
    """Extracted entity from document"""
    type: str = Field(description="Entity type: person, organization, date, amount, product, location")
    value: str = Field(description="Entity value/name")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Relationship(BaseModel):
    """Relationship between entities"""
    source: str = Field(description="Source entity value")
    target: str = Field(description="Target entity value")
    type: str = Field(description="Relationship type: works_for, mentions, issued_by, refers_to, etc.")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class ExtractionRequest(BaseModel):
    """Request for entity extraction"""
    doc_id: str
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ExtractionResponse(BaseModel):
    """Response from entity extraction"""
    doc_id: str
    entities: List[Entity]
    relationships: List[Relationship]
    processed_at: str


class QueryRequest(BaseModel):
    """Graph query request"""
    query: str = Field(description="SurrealQL query")
    params: Dict[str, Any] = Field(default_factory=dict)


# Database initialization
@app.on_event("startup")
async def startup_db():
    """Initialize SurrealDB connection"""
    global db
    try:
        db = Surreal(SURREALDB_URL)
        await db.connect()
        await db.signin({"user": SURREALDB_USER, "pass": SURREALDB_PASS})
        await db.use(SURREALDB_NS, SURREALDB_DB)
        
        # Create tables and indexes
        await init_schema()
        
        logger.info(f"✓ Connected to SurrealDB at {SURREALDB_URL}")
    except Exception as e:
        logger.error(f"Failed to connect to SurrealDB: {e}")
        db = None


@app.on_event("shutdown")
async def shutdown_db():
    """Close SurrealDB connection"""
    if db:
        await db.close()
        logger.info("✓ Closed SurrealDB connection")


async def init_schema():
    """Initialize database schema"""
    if not db:
        return
    
    try:
        # Define tables
        await db.query("""
            DEFINE TABLE document SCHEMAFULL;
            DEFINE FIELD doc_id ON document TYPE string;
            DEFINE FIELD filename ON document TYPE string;
            DEFINE FIELD text_preview ON document TYPE string;
            DEFINE FIELD tags ON document TYPE array;
            DEFINE FIELD created_at ON document TYPE datetime;
            DEFINE INDEX idx_doc_id ON document COLUMNS doc_id UNIQUE;
            
            DEFINE TABLE entity SCHEMAFULL;
            DEFINE FIELD type ON entity TYPE string;
            DEFINE FIELD value ON entity TYPE string;
            DEFINE FIELD confidence ON entity TYPE float;
            DEFINE FIELD metadata ON entity TYPE object;
            DEFINE FIELD created_at ON entity TYPE datetime;
            DEFINE INDEX idx_entity_value ON entity COLUMNS value;
            DEFINE INDEX idx_entity_type ON entity COLUMNS type;
            
            DEFINE TABLE mentions SCHEMAFULL TYPE RELATION FROM document TO entity;
            DEFINE FIELD confidence ON mentions TYPE float;
            DEFINE FIELD context ON mentions TYPE string;
            
            DEFINE TABLE relates SCHEMAFULL TYPE RELATION FROM entity TO entity;
            DEFINE FIELD type ON relates TYPE string;
            DEFINE FIELD confidence ON relates TYPE float;
        """)
        logger.info("✓ Schema initialized")
    except Exception as e:
        logger.warning(f"Schema init warning (may already exist): {e}")


# LLM-based entity extraction
async def extract_entities_with_llm(text: str, metadata: Dict[str, Any]) -> tuple[List[Entity], List[Relationship]]:
    """Use Ollama LLM to extract entities and relationships"""
    
    prompt = f"""Extract entities and relationships from this document text.

Document metadata: {metadata}

Text:
{text[:2000]}

Extract:
1. Entities with types: person, organization, date, amount, product, location
2. Relationships between entities: works_for, mentions, issued_by, refers_to, contains

Respond in JSON format:
{{
  "entities": [
    {{"type": "organization", "value": "Telekom GmbH", "confidence": 0.95}},
    {{"type": "date", "value": "2024-01-15", "confidence": 1.0}},
    {{"type": "amount", "value": "99.99 EUR", "confidence": 1.0}}
  ],
  "relationships": [
    {{"source": "Telekom GmbH", "target": "Invoice", "type": "issued_by", "confidence": 0.9}}
  ]
}}"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json"
                }
            )
            response.raise_for_status()
            result = response.json()
            
            # Parse LLM response
            import json
            llm_output = json.loads(result.get("response", "{}"))
            
            entities = [Entity(**e) for e in llm_output.get("entities", [])]
            relationships = [Relationship(**r) for r in llm_output.get("relationships", [])]
            
            logger.info(f"Extracted {len(entities)} entities and {len(relationships)} relationships")
            return entities, relationships
            
    except Exception as e:
        logger.error(f"LLM extraction failed: {e}")
        # Fallback: basic regex-based extraction
        return extract_entities_fallback(text, metadata)


def extract_entities_fallback(text: str, metadata: Dict[str, Any]) -> tuple[List[Entity], List[Relationship]]:
    """Fallback entity extraction using regex patterns"""
    import re
    
    entities = []
    relationships = []
    
    # Extract dates (YYYY-MM-DD, DD.MM.YYYY)
    date_pattern = r'\b(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\b'
    for match in re.finditer(date_pattern, text):
        entities.append(Entity(type="date", value=match.group(0), confidence=0.8))
    
    # Extract amounts (EUR, USD, €, $)
    amount_pattern = r'\b(\d+[.,]\d{2})\s*(EUR|USD|€|\$)\b'
    for match in re.finditer(amount_pattern, text):
        entities.append(Entity(type="amount", value=match.group(0), confidence=0.85))
    
    # Extract emails (as person/organization indicator)
    email_pattern = r'\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b'
    for match in re.finditer(email_pattern, text):
        entities.append(Entity(type="organization", value=match.group(0), confidence=0.7))
    
    logger.info(f"Fallback extracted {len(entities)} entities")
    return entities, relationships


# API Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    db_status = "connected" if db else "disconnected"
    return {
        "status": "ok",
        "service": "graph",
        "database": db_status,
        "surrealdb_url": SURREALDB_URL
    }


@app.post("/extract", response_model=ExtractionResponse)
async def extract_document(request: ExtractionRequest):
    """Extract entities and relationships from document"""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        # Extract entities using LLM
        entities, relationships = await extract_entities_with_llm(request.text, request.metadata)
        
        # Store document node
        doc_record = await db.create("document", {
            "doc_id": request.doc_id,
            "filename": request.metadata.get("filename", "unknown"),
            "text_preview": request.text[:500],
            "tags": request.metadata.get("tags", []),
            "created_at": datetime.now().isoformat()
        })
        
        # Store entities and create relationships
        for entity in entities:
            # Check if entity exists
            existing = await db.query(
                "SELECT * FROM entity WHERE type = $type AND value = $value LIMIT 1",
                {"type": entity.type, "value": entity.value}
            )
            
            if existing and len(existing[0].get("result", [])) > 0:
                entity_id = existing[0]["result"][0]["id"]
            else:
                # Create new entity
                entity_record = await db.create("entity", {
                    "type": entity.type,
                    "value": entity.value,
                    "confidence": entity.confidence,
                    "metadata": entity.metadata,
                    "created_at": datetime.now().isoformat()
                })
                entity_id = entity_record[0]["id"]
            
            # Create mentions relationship
            await db.query(
                f"RELATE {doc_record[0]['id']}->mentions->{entity_id} SET confidence = $conf, context = $ctx",
                {"conf": entity.confidence, "ctx": request.text[:200]}
            )
        
        # Store entity-to-entity relationships
        for rel in relationships:
            source_query = await db.query(
                "SELECT * FROM entity WHERE value = $val LIMIT 1",
                {"val": rel.source}
            )
            target_query = await db.query(
                "SELECT * FROM entity WHERE value = $val LIMIT 1",
                {"val": rel.target}
            )
            
            if (source_query and len(source_query[0].get("result", [])) > 0 and
                target_query and len(target_query[0].get("result", [])) > 0):
                
                source_id = source_query[0]["result"][0]["id"]
                target_id = target_query[0]["result"][0]["id"]
                
                await db.query(
                    f"RELATE {source_id}->relates->{target_id} SET type = $type, confidence = $conf",
                    {"type": rel.type, "conf": rel.confidence}
                )
        
        return ExtractionResponse(
            doc_id=request.doc_id,
            entities=entities,
            relationships=relationships,
            processed_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
async def query_graph(request: QueryRequest):
    """Execute SurrealQL query on graph"""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        result = await db.query(request.query, request.params)
        return {"result": result}
    except Exception as e:
        logger.error(f"Query failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/graph/{doc_id}")
async def get_document_graph(doc_id: str):
    """Get full graph for a document (entities and relationships)"""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        # Get document
        doc_result = await db.query(
            "SELECT * FROM document WHERE doc_id = $id",
            {"id": doc_id}
        )
        
        if not doc_result or len(doc_result[0].get("result", [])) == 0:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = doc_result[0]["result"][0]
        
        # Get entities mentioned by this document
        entities_result = await db.query(
            f"SELECT ->mentions->entity.* AS entities FROM document WHERE doc_id = $id",
            {"id": doc_id}
        )
        
        # Get relationships between those entities
        relationships_result = await db.query(
            f"SELECT * FROM relates WHERE in IN (SELECT ->mentions->entity FROM document WHERE doc_id = $id)",
            {"id": doc_id}
        )
        
        return {
            "document": document,
            "entities": entities_result[0].get("result", []),
            "relationships": relationships_result[0].get("result", [])
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get graph failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/entities/{entity_type}")
async def get_entities_by_type(entity_type: str, limit: int = 50):
    """Get all entities of a specific type"""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        result = await db.query(
            "SELECT * FROM entity WHERE type = $type LIMIT $limit",
            {"type": entity_type, "limit": limit}
        )
        
        return {"entities": result[0].get("result", [])}
        
    except Exception as e:
        logger.error(f"Get entities failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8530)
