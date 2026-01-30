"""
DMSCode Integration Tests - Pytest Fixtures
"""
import pytest
import httpx
import os
from pathlib import Path

# Service URLs from environment or defaults
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:8510")
SEARCH_SERVICE_URL = os.getenv("SEARCH_SERVICE_URL", "http://localhost:8520")
GRAPH_SERVICE_URL = os.getenv("GRAPH_SERVICE_URL", "http://localhost:8530")
AUTOMATION_SERVICE_URL = os.getenv("AUTOMATION_SERVICE_URL", "http://localhost:8540")
STORAGE_SERVICE_URL = os.getenv("STORAGE_SERVICE_URL", "http://localhost:8550")


@pytest.fixture
def test_data_dir():
    """Path to test data files"""
    return Path(__file__).parent / "data"


@pytest.fixture
def sample_pdf(test_data_dir):
    """Sample PDF for testing"""
    pdf_path = test_data_dir / "sample.pdf"
    if not pdf_path.exists():
        pytest.skip("sample.pdf not found in test data")
    return pdf_path


@pytest.fixture
def sample_image(test_data_dir):
    """Sample image for testing"""
    img_path = test_data_dir / "sample.png"
    if not img_path.exists():
        pytest.skip("sample.png not found in test data")
    return img_path


@pytest.fixture
async def ocr_client():
    """Async HTTP client for OCR service"""
    async with httpx.AsyncClient(base_url=OCR_SERVICE_URL, timeout=60.0) as client:
        yield client


@pytest.fixture
async def search_client():
    """Async HTTP client for Search service"""
    async with httpx.AsyncClient(base_url=SEARCH_SERVICE_URL, timeout=60.0) as client:
        yield client


@pytest.fixture
async def graph_client():
    """Async HTTP client for Graph service"""
    async with httpx.AsyncClient(base_url=GRAPH_SERVICE_URL, timeout=60.0) as client:
        yield client


@pytest.fixture
async def automation_client():
    """Async HTTP client for Automation service"""
    async with httpx.AsyncClient(base_url=AUTOMATION_SERVICE_URL, timeout=60.0) as client:
        yield client


@pytest.fixture
async def storage_client():
    """Async HTTP client for Storage service"""
    async with httpx.AsyncClient(base_url=STORAGE_SERVICE_URL, timeout=60.0) as client:
        yield client


@pytest.fixture
def test_document():
    """Sample document metadata for testing"""
    return {
        "id": "test-doc-001",
        "title": "Test Invoice",
        "content": "Invoice #12345 from ACME Corp. Total: €1,234.56. Due: 2024-03-15.",
        "type": "invoice",
        "tags": ["invoice", "acme", "2024"],
        "metadata": {
            "vendor": "ACME Corp",
            "amount": 1234.56,
            "currency": "EUR"
        }
    }
