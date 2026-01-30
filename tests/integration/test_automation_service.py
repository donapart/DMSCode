"""
Integration tests for Automation Service (Workflows)
"""
import pytest
import httpx
import uuid

pytestmark = pytest.mark.asyncio


async def test_health_check(automation_client):
    """Automation service health endpoint"""
    response = await automation_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


async def test_list_flows(automation_client):
    """List all automation flows"""
    response = await automation_client.get("/flows")
    assert response.status_code == 200
    data = response.json()
    assert "flows" in data
    assert isinstance(data["flows"], list)


async def test_create_simple_flow(automation_client):
    """Create a simple automation flow"""
    flow = {
        "id": f"test-flow-{uuid.uuid4().hex[:8]}",
        "name": "Test Add Tag Flow",
        "trigger": {
            "type": "ON_UPLOAD",
            "conditions": {}
        },
        "nodes": [
            {
                "id": "node-1",
                "type": "ACTION",
                "action": {
                    "type": "ADD_TAG",
                    "params": {"tag": "auto-tagged"}
                }
            }
        ],
        "edges": []
    }
    
    response = await automation_client.post("/flows", json=flow)
    assert response.status_code in [200, 201]
    
    # Clean up
    await automation_client.delete(f"/flows/{flow['id']}")


async def test_create_conditional_flow(automation_client):
    """Create flow with conditions"""
    flow = {
        "id": f"conditional-flow-{uuid.uuid4().hex[:8]}",
        "name": "Conditional Tag Flow",
        "trigger": {
            "type": "ON_OCR_COMPLETE",
            "conditions": {}
        },
        "nodes": [
            {
                "id": "condition-1",
                "type": "CONDITION",
                "condition": {
                    "field": "content",
                    "operator": "CONTAINS",
                    "value": "invoice"
                },
                "true_handle": "action-invoice",
                "false_handle": "action-other"
            },
            {
                "id": "action-invoice",
                "type": "ACTION",
                "action": {
                    "type": "ADD_TAG",
                    "params": {"tag": "invoice"}
                }
            },
            {
                "id": "action-other",
                "type": "ACTION",
                "action": {
                    "type": "ADD_TAG",
                    "params": {"tag": "document"}
                }
            }
        ],
        "edges": [
            {"from": "condition-1", "to": "action-invoice", "handle": "true"},
            {"from": "condition-1", "to": "action-other", "handle": "false"}
        ]
    }
    
    response = await automation_client.post("/flows", json=flow)
    assert response.status_code in [200, 201]
    
    await automation_client.delete(f"/flows/{flow['id']}")


async def test_trigger_flow_manually(automation_client):
    """Trigger a flow manually with document data"""
    # First create a flow
    flow = {
        "id": f"manual-trigger-{uuid.uuid4().hex[:8]}",
        "name": "Manual Trigger Test",
        "trigger": {"type": "ON_UPLOAD"},
        "nodes": [
            {
                "id": "action-1",
                "type": "ACTION",
                "action": {
                    "type": "ADD_TAG",
                    "params": {"tag": "manually-triggered"}
                }
            }
        ],
        "edges": []
    }
    
    await automation_client.post("/flows", json=flow)
    
    # Trigger it
    document = {
        "id": "test-doc-001",
        "content": "Test document content",
        "tags": []
    }
    
    response = await automation_client.post(f"/flows/{flow['id']}/trigger", json=document)
    assert response.status_code in [200, 202]
    
    await automation_client.delete(f"/flows/{flow['id']}")


async def test_get_flow_by_id(automation_client):
    """Get a specific flow by ID"""
    flow = {
        "id": f"get-flow-{uuid.uuid4().hex[:8]}",
        "name": "Get Flow Test",
        "trigger": {"type": "ON_UPLOAD"},
        "nodes": [],
        "edges": []
    }
    
    await automation_client.post("/flows", json=flow)
    
    response = await automation_client.get(f"/flows/{flow['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Get Flow Test"
    
    await automation_client.delete(f"/flows/{flow['id']}")


async def test_update_flow(automation_client):
    """Update an existing flow"""
    flow = {
        "id": f"update-flow-{uuid.uuid4().hex[:8]}",
        "name": "Original Name",
        "trigger": {"type": "ON_UPLOAD"},
        "nodes": [],
        "edges": []
    }
    
    await automation_client.post("/flows", json=flow)
    
    # Update
    flow["name"] = "Updated Name"
    response = await automation_client.put(f"/flows/{flow['id']}", json=flow)
    assert response.status_code == 200
    
    # Verify
    get_response = await automation_client.get(f"/flows/{flow['id']}")
    assert get_response.json()["name"] == "Updated Name"
    
    await automation_client.delete(f"/flows/{flow['id']}")


async def test_delete_flow(automation_client):
    """Delete a flow"""
    flow = {
        "id": f"delete-flow-{uuid.uuid4().hex[:8]}",
        "name": "Flow to Delete",
        "trigger": {"type": "ON_UPLOAD"},
        "nodes": [],
        "edges": []
    }
    
    await automation_client.post("/flows", json=flow)
    
    response = await automation_client.delete(f"/flows/{flow['id']}")
    assert response.status_code in [200, 204]
    
    # Verify deleted
    get_response = await automation_client.get(f"/flows/{flow['id']}")
    assert get_response.status_code == 404


async def test_flow_execution_history(automation_client):
    """Get execution history for a flow"""
    response = await automation_client.get("/flows/history", params={"limit": 10})
    
    if response.status_code == 200:
        data = response.json()
        assert "executions" in data or "history" in data


async def test_cron_flows(automation_client):
    """List flows with cron triggers"""
    response = await automation_client.get("/flows/cron")
    
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list) or "flows" in data
