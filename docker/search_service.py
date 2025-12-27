"""
Semantic Search Service für DMSCode
Embeddings + Vector Search mit FAISS
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import numpy as np
import faiss
import json
import os
from typing import List, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DMSCode Semantic Search",
    description="Semantische Suche mit Embeddings für DMSCode",
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
MODEL_NAME = os.getenv("MODEL_NAME", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
DATA_DIR = "/app/data"
INDEX_FILE = os.path.join(DATA_DIR, "faiss.index")
METADATA_FILE = os.path.join(DATA_DIR, "metadata.json")

# Globale Variablen
model: Optional[SentenceTransformer] = None
index: Optional[faiss.IndexFlatIP] = None
metadata: dict = {"documents": {}}

class Document(BaseModel):
    id: str
    text: str
    metadata: Optional[dict] = None

class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    threshold: float = 0.5

class SearchResult(BaseModel):
    id: str
    score: float
    text: str
    metadata: Optional[dict] = None

class IndexRequest(BaseModel):
    documents: List[Document]

@app.on_event("startup")
async def startup():
    """Modell und Index laden"""
    global model, index, metadata
    
    logger.info(f"Loading model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    
    # Dimension des Modells ermitteln
    dim = model.get_sentence_embedding_dimension()
    logger.info(f"Embedding dimension: {dim}")
    
    # Index laden oder erstellen
    if os.path.exists(INDEX_FILE):
        logger.info("Loading existing FAISS index")
        index = faiss.read_index(INDEX_FILE)
    else:
        logger.info("Creating new FAISS index")
        index = faiss.IndexFlatIP(dim)  # Inner Product für Cosine Similarity
    
    # Metadata laden
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, 'r') as f:
            metadata = json.load(f)
    
    logger.info(f"Index contains {index.ntotal} vectors")

def save_index():
    """Index und Metadata speichern"""
    os.makedirs(DATA_DIR, exist_ok=True)
    faiss.write_index(index, INDEX_FILE)
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f)

@app.get("/health")
async def health():
    """Health Check"""
    return {
        "status": "healthy",
        "service": "semantic-search",
        "model": MODEL_NAME,
        "index_size": index.ntotal if index else 0
    }

@app.post("/embed")
async def get_embedding(doc: Document):
    """
    Embedding für einen Text generieren
    """
    try:
        embedding = model.encode(doc.text, normalize_embeddings=True)
        return {
            "id": doc.id,
            "embedding": embedding.tolist(),
            "dimension": len(embedding)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/index")
async def index_documents(request: IndexRequest):
    """
    Dokumente indexieren
    """
    global index, metadata
    
    try:
        texts = [doc.text for doc in request.documents]
        ids = [doc.id for doc in request.documents]
        
        logger.info(f"Indexing {len(texts)} documents")
        
        # Embeddings generieren
        embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
        embeddings = np.array(embeddings).astype('float32')
        
        # Zu Index hinzufügen
        index.add(embeddings)
        
        # Metadata speichern
        for i, doc in enumerate(request.documents):
            idx = index.ntotal - len(request.documents) + i
            metadata["documents"][str(idx)] = {
                "id": doc.id,
                "text": doc.text[:500],  # Nur ersten 500 Zeichen speichern
                "metadata": doc.metadata
            }
        
        save_index()
        
        return {
            "indexed": len(request.documents),
            "total": index.ntotal
        }
    except Exception as e:
        logger.error(f"Indexing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search", response_model=List[SearchResult])
async def search(request: SearchRequest):
    """
    Semantische Suche durchführen
    """
    try:
        if index.ntotal == 0:
            return []
        
        # Query embedding
        query_embedding = model.encode(request.query, normalize_embeddings=True)
        query_embedding = np.array([query_embedding]).astype('float32')
        
        # Suche durchführen
        k = min(request.top_k, index.ntotal)
        scores, indices = index.search(query_embedding, k)
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if score >= request.threshold and idx >= 0:
                doc_meta = metadata["documents"].get(str(idx), {})
                results.append(SearchResult(
                    id=doc_meta.get("id", f"doc_{idx}"),
                    score=float(score),
                    text=doc_meta.get("text", ""),
                    metadata=doc_meta.get("metadata")
                ))
        
        return results
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/document/{doc_id}")
async def delete_document(doc_id: str):
    """
    Dokument aus Index entfernen (markiert als gelöscht)
    """
    # FAISS unterstützt kein direktes Löschen, 
    # wir markieren nur in Metadata
    for idx, doc in metadata["documents"].items():
        if doc.get("id") == doc_id:
            doc["deleted"] = True
    save_index()
    return {"deleted": doc_id}

@app.post("/clear")
async def clear_index():
    """
    Index komplett leeren
    """
    global index, metadata
    
    dim = model.get_sentence_embedding_dimension()
    index = faiss.IndexFlatIP(dim)
    metadata = {"documents": {}}
    save_index()
    
    return {"status": "cleared"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
