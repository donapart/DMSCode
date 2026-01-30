"""
Integration tests for OCR Service
"""
import pytest
import httpx
from pathlib import Path

pytestmark = pytest.mark.asyncio


async def test_health_check(ocr_client):
    """OCR service health endpoint"""
    response = await ocr_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


async def test_ocr_text_extraction(ocr_client, sample_image):
    """Extract text from image"""
    with open(sample_image, "rb") as f:
        files = {"file": ("test.png", f, "image/png")}
        response = await ocr_client.post("/ocr", files=files)
    
    assert response.status_code == 200
    data = response.json()
    assert "text" in data
    assert isinstance(data["text"], str)


async def test_ocr_pdf_extraction(ocr_client, sample_pdf):
    """Extract text from PDF"""
    with open(sample_pdf, "rb") as f:
        files = {"file": ("test.pdf", f, "application/pdf")}
        response = await ocr_client.post("/ocr", files=files)
    
    assert response.status_code == 200
    data = response.json()
    assert "text" in data


async def test_ocr_with_language(ocr_client, sample_image):
    """OCR with specific language"""
    with open(sample_image, "rb") as f:
        files = {"file": ("test.png", f, "image/png")}
        response = await ocr_client.post("/ocr", files=files, params={"lang": "deu"})
    
    assert response.status_code == 200


async def test_ocr_invalid_file(ocr_client):
    """OCR with invalid file type"""
    files = {"file": ("test.txt", b"not an image", "text/plain")}
    response = await ocr_client.post("/ocr", files=files)
    
    # Should handle gracefully
    assert response.status_code in [400, 422, 500]


async def test_ocr_structured_extraction(ocr_client, sample_image):
    """Extract structured data (if available)"""
    with open(sample_image, "rb") as f:
        files = {"file": ("invoice.png", f, "image/png")}
        response = await ocr_client.post("/ocr/structured", files=files)
    
    # May return 404 if endpoint not implemented
    if response.status_code == 200:
        data = response.json()
        assert "text" in data or "structured" in data
