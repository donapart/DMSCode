"""
Storage Service for DMSCode
Provides S3-compatible document storage using MinIO
"""
import os
import io
import logging
from typing import List, Optional, BinaryIO
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from minio import Minio
from minio.error import S3Error

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "dmscode")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "dmscode123")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
DEFAULT_BUCKET = os.getenv("DEFAULT_BUCKET", "documents")

app = FastAPI(title="DMSCode Storage Service", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MinIO Client
minio_client: Optional[Minio] = None


class StorageObject(BaseModel):
    """Stored object metadata"""
    name: str
    size: int
    content_type: str
    last_modified: datetime
    etag: str
    metadata: dict = Field(default_factory=dict)


class UploadResponse(BaseModel):
    """Response after successful upload"""
    object_name: str
    bucket: str
    size: int
    etag: str
    url: str


class BucketInfo(BaseModel):
    """Bucket information"""
    name: str
    creation_date: Optional[datetime] = None


@app.on_event("startup")
async def startup():
    """Initialize MinIO connection and ensure default bucket exists"""
    global minio_client
    
    try:
        minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE
        )
        
        # Ensure default bucket exists
        if not minio_client.bucket_exists(DEFAULT_BUCKET):
            minio_client.make_bucket(DEFAULT_BUCKET)
            logger.info(f"✓ Created bucket: {DEFAULT_BUCKET}")
        
        logger.info(f"✓ Connected to MinIO at {MINIO_ENDPOINT}")
    except Exception as e:
        logger.error(f"Failed to connect to MinIO: {e}")
        minio_client = None


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    if minio_client is None:
        raise HTTPException(status_code=503, detail="MinIO not connected")
    
    try:
        minio_client.list_buckets()
        return {"status": "ok", "service": "storage", "endpoint": MINIO_ENDPOINT}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"MinIO error: {e}")


# ===== Bucket Operations =====

@app.get("/buckets", response_model=List[BucketInfo])
async def list_buckets():
    """List all buckets"""
    if not minio_client:
        raise HTTPException(status_code=503, detail="Storage not available")
    
    buckets = minio_client.list_buckets()
    return [BucketInfo(name=b.name, creation_date=b.creation_date) for b in buckets]


@app.post("/buckets/{bucket_name}")
async def create_bucket(bucket_name: str):
    """Create a new bucket"""
    if not minio_client:
        raise HTTPException(status_code=503, detail="Storage not available")
    
    try:
        if minio_client.bucket_exists(bucket_name):
            raise HTTPException(status_code=409, detail="Bucket already exists")
        
        minio_client.make_bucket(bucket_name)
        return {"message": f"Bucket '{bucket_name}' created", "bucket": bucket_name}
    except S3Error as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== Object Operations =====

@app.get("/objects", response_model=List[StorageObject])
async def list_objects(
    bucket: str = Query(DEFAULT_BUCKET, description="Bucket name"),
    prefix: str = Query("", description="Filter by prefix/folder"),
    recursive: bool = Query(True, description="Include nested objects")
):
    """List objects in a bucket"""
    if not minio_client:
        raise HTTPException(status_code=503, detail="Storage not available")
    
    try:
        objects = minio_client.list_objects(bucket, prefix=prefix, recursive=recursive)
        return [
            StorageObject(
                name=obj.object_name,
                size=obj.size or 0,
                content_type=obj.content_type or "application/octet-stream",
                last_modified=obj.last_modified,
                etag=obj.etag or ""
            )
            for obj in objects
        ]
    except S3Error as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/objects", response_model=UploadResponse)
async def upload_object(
    file: UploadFile = File(...),
    bucket: str = Query(DEFAULT_BUCKET, description="Target bucket"),
    folder: str = Query("", description="Target folder/prefix"),
    tags: str = Query("", description="Comma-separated tags")
):
    """Upload a file to storage"""
    if not minio_client:
        raise HTTPException(status_code=503, detail="Storage not available")
    
    try:
        # Build object name
        object_name = f"{folder}/{file.filename}" if folder else file.filename
        object_name = object_name.lstrip("/")
        
        # Read file content
        content = await file.read()
        content_stream = io.BytesIO(content)
        
        # Build metadata
        metadata = {}
        if tags:
            metadata["x-amz-meta-tags"] = tags
        metadata["x-amz-meta-uploaded-at"] = datetime.now().isoformat()
        
        # Upload to MinIO
        result = minio_client.put_object(
            bucket,
            object_name,
            content_stream,
            length=len(content),
            content_type=file.content_type or "application/octet-stream",
            metadata=metadata
        )
        
        # Generate presigned URL for access
        url = minio_client.presigned_get_object(bucket, object_name, expires=timedelta(hours=24))
        
        logger.info(f"Uploaded: {object_name} ({len(content)} bytes)")
        
        return UploadResponse(
            object_name=object_name,
            bucket=bucket,
            size=len(content),
            etag=result.etag,
            url=url
        )
    except S3Error as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/objects/{object_name:path}")
async def download_object(
    object_name: str,
    bucket: str = Query(DEFAULT_BUCKET, description="Source bucket")
):
    """Download an object from storage"""
    if not minio_client:
        raise HTTPException(status_code=503, detail="Storage not available")
    
    try:
        # Get object
        response = minio_client.get_object(bucket, object_name)
        
        # Get content type from stat
        stat = minio_client.stat_object(bucket, object_name)
        content_type = stat.content_type or "application/octet-stream"
        
        # Stream response
        def iterfile():
            try:
                for chunk in response.stream(1024 * 1024):  # 1MB chunks
                    yield chunk
            finally:
                response.close()
                response.release_conn()
        
        filename = object_name.split("/")[-1]
        return StreamingResponse(
            iterfile(),
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(status_code=404, detail="Object not found")
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/objects/{object_name:path}")
async def delete_object(
    object_name: str,
    bucket: str = Query(DEFAULT_BUCKET, description="Source bucket")
):
    """Delete an object from storage"""
    if not minio_client:
        raise HTTPException(status_code=503, detail="Storage not available")
    
    try:
        minio_client.remove_object(bucket, object_name)
        logger.info(f"Deleted: {object_name}")
        return {"message": f"Object '{object_name}' deleted", "bucket": bucket}
    except S3Error as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/objects/{object_name:path}/url")
async def get_presigned_url(
    object_name: str,
    bucket: str = Query(DEFAULT_BUCKET, description="Source bucket"),
    expires_hours: int = Query(24, description="URL expiration in hours", ge=1, le=168)
):
    """Get a presigned URL for temporary access"""
    if not minio_client:
        raise HTTPException(status_code=503, detail="Storage not available")
    
    try:
        url = minio_client.presigned_get_object(
            bucket, 
            object_name, 
            expires=timedelta(hours=expires_hours)
        )
        return {
            "url": url,
            "expires_in_hours": expires_hours,
            "object_name": object_name
        }
    except S3Error as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/objects/{object_name:path}/metadata", response_model=StorageObject)
async def get_object_metadata(
    object_name: str,
    bucket: str = Query(DEFAULT_BUCKET, description="Source bucket")
):
    """Get object metadata"""
    if not minio_client:
        raise HTTPException(status_code=503, detail="Storage not available")
    
    try:
        stat = minio_client.stat_object(bucket, object_name)
        return StorageObject(
            name=object_name,
            size=stat.size,
            content_type=stat.content_type or "application/octet-stream",
            last_modified=stat.last_modified,
            etag=stat.etag,
            metadata=dict(stat.metadata) if stat.metadata else {}
        )
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(status_code=404, detail="Object not found")
        raise HTTPException(status_code=400, detail=str(e))


# ===== Sync Operations =====

@app.post("/sync/upload-folder")
async def sync_upload_folder(
    local_path: str = Query(..., description="Local folder path to upload"),
    bucket: str = Query(DEFAULT_BUCKET, description="Target bucket"),
    prefix: str = Query("", description="Target prefix in bucket")
):
    """
    Sync a local folder to storage (for bulk import).
    This is a server-side operation - the local_path must be accessible from the server.
    """
    # This would be called from the VS Code extension with a mounted volume
    # For now, return a placeholder
    return {
        "message": "Sync operation queued",
        "local_path": local_path,
        "bucket": bucket,
        "prefix": prefix,
        "status": "pending"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8550)
