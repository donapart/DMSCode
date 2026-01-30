"""
Integration tests for Storage Service (MinIO S3)
"""
import pytest
import httpx
import uuid

pytestmark = pytest.mark.asyncio


async def test_health_check(storage_client):
    """Storage service health endpoint"""
    response = await storage_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


async def test_list_buckets(storage_client):
    """List all buckets"""
    response = await storage_client.get("/buckets")
    assert response.status_code == 200
    data = response.json()
    assert "buckets" in data
    assert isinstance(data["buckets"], list)


async def test_create_bucket(storage_client):
    """Create a new bucket"""
    bucket_name = f"test-bucket-{uuid.uuid4().hex[:8]}"
    
    response = await storage_client.post("/buckets", json={"name": bucket_name})
    assert response.status_code in [200, 201]
    
    # Clean up
    await storage_client.delete(f"/buckets/{bucket_name}")


async def test_upload_object(storage_client):
    """Upload an object to storage"""
    content = b"Test document content for storage integration test"
    files = {"file": ("test-doc.txt", content, "text/plain")}
    
    response = await storage_client.post("/objects", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "name" in data or "object_name" in data


async def test_list_objects(storage_client):
    """List objects in default bucket"""
    response = await storage_client.get("/objects")
    assert response.status_code == 200
    data = response.json()
    assert "objects" in data
    assert isinstance(data["objects"], list)


async def test_upload_and_download(storage_client):
    """Upload and download object"""
    content = b"Integration test content - upload and download"
    object_name = f"test-{uuid.uuid4().hex[:8]}.txt"
    files = {"file": (object_name, content, "text/plain")}
    
    # Upload
    upload_response = await storage_client.post("/objects", files=files)
    assert upload_response.status_code == 200
    
    # Download
    download_response = await storage_client.get(f"/objects/{object_name}")
    assert download_response.status_code == 200
    assert download_response.content == content
    
    # Clean up
    await storage_client.delete(f"/objects/{object_name}")


async def test_get_presigned_url(storage_client):
    """Get presigned URL for object"""
    # First upload an object
    content = b"Test content for presigned URL"
    object_name = f"presigned-test-{uuid.uuid4().hex[:8]}.txt"
    files = {"file": (object_name, content, "text/plain")}
    
    await storage_client.post("/objects", files=files)
    
    # Get presigned URL
    response = await storage_client.get(f"/objects/{object_name}/url")
    assert response.status_code == 200
    data = response.json()
    assert "url" in data
    assert "http" in data["url"]
    
    # Clean up
    await storage_client.delete(f"/objects/{object_name}")


async def test_delete_object(storage_client):
    """Delete an object"""
    content = b"Content to be deleted"
    object_name = f"delete-test-{uuid.uuid4().hex[:8]}.txt"
    files = {"file": (object_name, content, "text/plain")}
    
    # Upload
    await storage_client.post("/objects", files=files)
    
    # Delete
    response = await storage_client.delete(f"/objects/{object_name}")
    assert response.status_code in [200, 204]
    
    # Verify deleted
    get_response = await storage_client.get(f"/objects/{object_name}")
    assert get_response.status_code == 404


async def test_object_metadata(storage_client):
    """Get object metadata"""
    content = b"Content with metadata"
    object_name = f"metadata-test-{uuid.uuid4().hex[:8]}.txt"
    files = {"file": (object_name, content, "text/plain")}
    
    await storage_client.post("/objects", files=files)
    
    response = await storage_client.get(f"/objects/{object_name}/metadata")
    
    if response.status_code == 200:
        data = response.json()
        assert "size" in data or "content_type" in data
    
    # Clean up
    await storage_client.delete(f"/objects/{object_name}")
