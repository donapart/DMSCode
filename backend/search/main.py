"""
DMSCode Search Service
Semantische Suche mit Sentence Transformers und ChromaDB
"""

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="DMSCode Search Service",
    description="Semantische Dokumentensuche",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Konfiguration
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
CHROMADB_PATH = os.getenv("CHROMADB_PATH", "./data/embeddings")

# Lazy Loading für Model und DB
_model = None
_collection = None

def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model

def get_collection():
    global _collection
    if _collection is None:
        import chromadb
        client = chromadb.PersistentClient(path=CHROMADB_PATH)
        _collection = client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"}
        )
    return _collection

class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    filter_tags: Optional[list[str]] = None

class DocumentInfo(BaseModel):
    id: str
    name: str
    path: str
    type: str
    tags: list[str]

class SearchResult(BaseModel):
    document: DocumentInfo
    score: float
    snippet: str

class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str
    total: int

class IndexRequest(BaseModel):
    id: str
    name: str
    path: str
    type: str
    content: str
    tags: list[str] = []

class IndexResponse(BaseModel):
    success: bool
    id: str
    embedding_size: int

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "search", "model": EMBEDDING_MODEL}

@app.post("/search", response_model=SearchResponse)
async def semantic_search(request: SearchRequest):
    """
    Semantische Suche in indizierten Dokumenten
    """
    try:
        model = get_model()
        collection = get_collection()
        
        # Query-Embedding erstellen
        query_embedding = model.encode(request.query).tolist()
        
        # In ChromaDB suchen
        where_filter = None
        if request.filter_tags:
            where_filter = {"tags": {"$in": request.filter_tags}}
        
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=request.top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"]
        )
        
        # Ergebnisse formatieren
        search_results = []
        
        if results['ids'] and results['ids'][0]:
            for i, doc_id in enumerate(results['ids'][0]):
                metadata = results['metadatas'][0][i] if results['metadatas'] else {}
                document = results['documents'][0][i] if results['documents'] else ""
                distance = results['distances'][0][i] if results['distances'] else 1.0
                
                # Distance zu Score konvertieren (Cosine: kleiner = besser)
                score = 1 - distance
                
                # Snippet aus Dokument erstellen
                snippet = document[:200] + "..." if len(document) > 200 else document
                
                search_results.append(SearchResult(
                    document=DocumentInfo(
                        id=doc_id,
                        name=metadata.get('name', 'Unbekannt'),
                        path=metadata.get('path', ''),
                        type=metadata.get('type', 'unknown'),
                        tags=metadata.get('tags', '').split(',') if metadata.get('tags') else []
                    ),
                    score=score,
                    snippet=snippet
                ))
        
        return SearchResponse(
            results=search_results,
            query=request.query,
            total=len(search_results)
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Suchfehler: {str(e)}")

@app.post("/index", response_model=IndexResponse)
async def index_document(request: IndexRequest):
    """
    Dokument in den Suchindex aufnehmen
    """
    try:
        model = get_model()
        collection = get_collection()
        
        # Embedding erstellen
        embedding = model.encode(request.content).tolist()
        
        # In ChromaDB speichern
        collection.upsert(
            ids=[request.id],
            embeddings=[embedding],
            documents=[request.content],
            metadatas=[{
                "name": request.name,
                "path": request.path,
                "type": request.type,
                "tags": ",".join(request.tags)
            }]
        )
        
        return IndexResponse(
            success=True,
            id=request.id,
            embedding_size=len(embedding)
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Index-Fehler: {str(e)}")

@app.delete("/index/{doc_id}")
async def delete_document(doc_id: str):
    """
    Dokument aus dem Index entfernen
    """
    try:
        collection = get_collection()
        collection.delete(ids=[doc_id])
        return {"success": True, "deleted": doc_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Löschfehler: {str(e)}")

@app.get("/stats")
async def get_stats():
    """
    Statistiken über den Suchindex
    """
    try:
        collection = get_collection()
        return {
            "total_documents": collection.count(),
            "embedding_model": EMBEDDING_MODEL,
            "storage_path": CHROMADB_PATH
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8520)
