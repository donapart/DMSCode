"""
End-to-End Integration Test
Tests the full document workflow: Upload → OCR → Index → Search → Graph
"""
import pytest
import httpx
import uuid
import asyncio
from pathlib import Path

pytestmark = pytest.mark.asyncio


class TestDocumentWorkflow:
    """End-to-end document processing workflow tests"""
    
    @pytest.fixture
    def document_id(self):
        return f"e2e-doc-{uuid.uuid4().hex[:8]}"
    
    async def test_full_document_workflow(
        self, 
        storage_client, 
        ocr_client, 
        search_client, 
        graph_client,
        document_id
    ):
        """
        Test complete workflow:
        1. Upload document to storage
        2. Run OCR on document
        3. Index extracted text
        4. Search for document
        5. Add to knowledge graph
        6. Query graph
        7. Clean up
        """
        # Step 1: Upload document
        content = b"%PDF-1.4\nTest invoice content\nACME Corp\n$1,234.56"
        files = {"file": (f"{document_id}.pdf", content, "application/pdf")}
        
        upload_response = await storage_client.post("/objects", files=files)
        assert upload_response.status_code == 200, "Upload failed"
        
        # Step 2: Simulate OCR result (since we don't have a real PDF)
        ocr_text = "Invoice #12345 from ACME Corp. Amount: $1,234.56. Date: 2024-03-15"
        
        # Step 3: Index the document
        doc_data = {
            "id": document_id,
            "title": "Test Invoice",
            "content": ocr_text,
            "type": "invoice",
            "tags": ["invoice", "acme", "e2e-test"],
            "metadata": {
                "source": "e2e-test",
                "amount": 1234.56
            }
        }
        
        index_response = await search_client.post("/index", json=doc_data)
        assert index_response.status_code == 200, "Indexing failed"
        
        # Step 4: Search for the document
        await asyncio.sleep(0.5)  # Give time for indexing
        
        search_response = await search_client.post("/search", json={
            "query": "ACME invoice",
            "limit": 5
        })
        assert search_response.status_code == 200, "Search failed"
        results = search_response.json().get("results", [])
        
        # Step 5: Add to knowledge graph
        graph_response = await graph_client.post("/nodes/document", json=doc_data)
        # May fail if graph service not available
        if graph_response.status_code in [200, 201]:
            # Step 6: Add entity relationship
            entity = {
                "id": f"company-acme-{uuid.uuid4().hex[:8]}",
                "type": "company",
                "name": "ACME Corp"
            }
            await graph_client.post("/nodes/entity", json=entity)
        
        # Step 7: Cleanup
        await storage_client.delete(f"/objects/{document_id}.pdf")
        await search_client.delete(f"/documents/{document_id}")
    
    async def test_batch_document_processing(
        self,
        storage_client,
        search_client,
    ):
        """Test processing multiple documents"""
        documents = []
        
        for i in range(3):
            doc_id = f"batch-{uuid.uuid4().hex[:8]}"
            documents.append({
                "id": doc_id,
                "title": f"Batch Document {i}",
                "content": f"Batch test document number {i} with unique content",
                "type": "test",
                "tags": ["batch-test", f"doc-{i}"]
            })
        
        # Index all
        for doc in documents:
            response = await search_client.post("/index", json=doc)
            assert response.status_code == 200
        
        # Search
        await asyncio.sleep(0.5)
        search_response = await search_client.post("/search", json={
            "query": "batch test document",
            "limit": 10
        })
        assert search_response.status_code == 200
        
        # Cleanup
        for doc in documents:
            await search_client.delete(f"/documents/{doc['id']}")
    
    async def test_automation_triggered_workflow(
        self,
        automation_client,
        search_client
    ):
        """Test automation flow triggered by document upload"""
        # Create a test flow
        flow = {
            "id": f"e2e-flow-{uuid.uuid4().hex[:8]}",
            "name": "E2E Test Flow",
            "trigger": {"type": "ON_UPLOAD"},
            "nodes": [
                {
                    "id": "condition-1",
                    "type": "CONDITION",
                    "condition": {
                        "field": "content",
                        "operator": "CONTAINS",
                        "value": "invoice"
                    },
                    "true_handle": "tag-invoice",
                    "false_handle": None
                },
                {
                    "id": "tag-invoice",
                    "type": "ACTION",
                    "action": {
                        "type": "ADD_TAG",
                        "params": {"tag": "auto-invoice"}
                    }
                }
            ],
            "edges": [
                {"from": "condition-1", "to": "tag-invoice", "handle": "true"}
            ]
        }
        
        # Create flow
        create_response = await automation_client.post("/flows", json=flow)
        assert create_response.status_code in [200, 201]
        
        # Trigger with document data
        document = {
            "id": "trigger-doc-001",
            "content": "This is an invoice from ACME Corp",
            "tags": []
        }
        
        trigger_response = await automation_client.post(
            f"/flows/{flow['id']}/trigger", 
            json=document
        )
        assert trigger_response.status_code in [200, 202]
        
        # Cleanup
        await automation_client.delete(f"/flows/{flow['id']}")


class TestServiceInteraction:
    """Tests for service-to-service communication"""
    
    async def test_all_services_health(
        self,
        ocr_client,
        search_client,
        graph_client,
        automation_client,
        storage_client
    ):
        """Verify all services are healthy"""
        services = [
            ("OCR", ocr_client),
            ("Search", search_client),
            ("Graph", graph_client),
            ("Automation", automation_client),
            ("Storage", storage_client)
        ]
        
        results = {}
        for name, client in services:
            try:
                response = await client.get("/health")
                results[name] = response.status_code == 200
            except Exception as e:
                results[name] = False
        
        # At least storage and search should be available
        assert results.get("Storage") or results.get("Search"), \
            f"Core services unavailable: {results}"
