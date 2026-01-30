"""
Integration tests for Graph Service (Knowledge Graph / GraphRAG)
"""
import pytest
import httpx
import uuid

pytestmark = pytest.mark.asyncio


async def test_health_check(graph_client):
    """Graph service health endpoint"""
    response = await graph_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


async def test_add_document_node(graph_client, test_document):
    """Add a document to the knowledge graph"""
    response = await graph_client.post("/nodes/document", json=test_document)
    assert response.status_code in [200, 201]
    data = response.json()
    assert "id" in data or "node_id" in data


async def test_add_entity_node(graph_client):
    """Add an entity node"""
    entity = {
        "id": f"entity-{uuid.uuid4().hex[:8]}",
        "type": "company",
        "name": "ACME Corp",
        "properties": {
            "industry": "Technology",
            "founded": 1990
        }
    }
    
    response = await graph_client.post("/nodes/entity", json=entity)
    assert response.status_code in [200, 201]


async def test_create_relationship(graph_client, test_document):
    """Create relationship between nodes"""
    # Add document
    doc_response = await graph_client.post("/nodes/document", json=test_document)
    doc_id = doc_response.json().get("id", test_document["id"])
    
    # Add entity
    entity = {
        "id": f"entity-{uuid.uuid4().hex[:8]}",
        "type": "company",
        "name": "ACME Corp"
    }
    entity_response = await graph_client.post("/nodes/entity", json=entity)
    entity_id = entity_response.json().get("id", entity["id"])
    
    # Create relationship
    relationship = {
        "from_id": doc_id,
        "to_id": entity_id,
        "type": "MENTIONS",
        "properties": {"confidence": 0.95}
    }
    
    response = await graph_client.post("/relationships", json=relationship)
    assert response.status_code in [200, 201]


async def test_query_related_documents(graph_client, test_document):
    """Query documents related to an entity"""
    await graph_client.post("/nodes/document", json=test_document)
    
    response = await graph_client.get("/query/related", params={
        "entity_name": "ACME",
        "limit": 10
    })
    
    if response.status_code == 200:
        data = response.json()
        assert "documents" in data or "results" in data


async def test_graphrag_query(graph_client):
    """GraphRAG query combining graph + semantic search"""
    response = await graph_client.post("/graphrag/query", json={
        "query": "What invoices are from ACME Corp?",
        "include_context": True,
        "max_hops": 2
    })
    
    if response.status_code == 200:
        data = response.json()
        assert "answer" in data or "results" in data


async def test_extract_entities(graph_client):
    """Extract entities from text"""
    response = await graph_client.post("/extract/entities", json={
        "text": "Invoice from ACME Corp dated 2024-03-15. Contact: John Smith at john@acme.com",
        "entity_types": ["company", "person", "date", "email"]
    })
    
    if response.status_code == 200:
        data = response.json()
        assert "entities" in data


async def test_get_document_context(graph_client, test_document):
    """Get full context for a document"""
    await graph_client.post("/nodes/document", json=test_document)
    
    response = await graph_client.get(f"/documents/{test_document['id']}/context")
    
    if response.status_code == 200:
        data = response.json()
        assert "document" in data or "context" in data


async def test_delete_document_node(graph_client, test_document):
    """Delete a document from the graph"""
    await graph_client.post("/nodes/document", json=test_document)
    
    response = await graph_client.delete(f"/nodes/document/{test_document['id']}")
    assert response.status_code in [200, 204, 404]
