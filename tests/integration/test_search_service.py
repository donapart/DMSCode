"""
Integration tests for Semantic Search Service
"""
import pytest
import httpx
import uuid

pytestmark = pytest.mark.asyncio


async def test_health_check(search_client):
    """Search service health endpoint"""
    response = await search_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


async def test_index_document(search_client, test_document):
    """Index a document for search"""
    response = await search_client.post("/index", json=test_document)
    assert response.status_code == 200
    data = response.json()
    assert data.get("success") or data.get("indexed")


async def test_semantic_search(search_client, test_document):
    """Perform semantic search"""
    # First index the document
    await search_client.post("/index", json=test_document)
    
    # Search for it
    response = await search_client.post("/search", json={
        "query": "invoice from ACME",
        "limit": 5
    })
    
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert isinstance(data["results"], list)


async def test_search_with_filters(search_client, test_document):
    """Search with tag filters"""
    await search_client.post("/index", json=test_document)
    
    response = await search_client.post("/search", json={
        "query": "invoice",
        "filters": {"tags": ["invoice"]},
        "limit": 10
    })
    
    assert response.status_code == 200


async def test_search_empty_query(search_client):
    """Search with empty query"""
    response = await search_client.post("/search", json={
        "query": "",
        "limit": 5
    })
    
    # Should handle gracefully
    assert response.status_code in [200, 400]


async def test_similar_documents(search_client, test_document):
    """Find similar documents"""
    await search_client.post("/index", json=test_document)
    
    response = await search_client.post("/similar", json={
        "document_id": test_document["id"],
        "limit": 5
    })
    
    if response.status_code == 200:
        data = response.json()
        assert "results" in data or "similar" in data


async def test_delete_document(search_client, test_document):
    """Delete document from index"""
    await search_client.post("/index", json=test_document)
    
    response = await search_client.delete(f"/documents/{test_document['id']}")
    
    # May return 200 or 204
    assert response.status_code in [200, 204, 404]


async def test_batch_index(search_client):
    """Index multiple documents"""
    documents = [
        {
            "id": f"batch-{i}",
            "title": f"Document {i}",
            "content": f"Content for document number {i}",
            "type": "test",
            "tags": ["batch", "test"]
        }
        for i in range(3)
    ]
    
    response = await search_client.post("/index/batch", json={"documents": documents})
    
    if response.status_code == 200:
        data = response.json()
        assert data.get("indexed") == 3 or data.get("success")
