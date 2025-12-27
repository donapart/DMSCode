#!/usr/bin/env python3
"""Test script for Semantic Search API"""
import requests
import json

BASE_URL = "http://localhost:8520"

def test_index():
    """Test document indexing"""
    data = {
        "id": "test-doc-1",
        "text": "Dies ist ein Testdokument über Rechnungen und Verträge.",
        "metadata": {"title": "Testdokument", "type": "test"}
    }
    response = requests.post(f"{BASE_URL}/index", json=data)
    print(f"Index: {response.status_code} - {response.text}")
    return response.ok

def test_search():
    """Test semantic search"""
    data = {"query": "Rechnung", "limit": 5}
    response = requests.post(f"{BASE_URL}/search", json=data)
    print(f"Search: {response.status_code} - {response.text}")
    return response.ok

def test_stats():
    """Test stats endpoint"""
    response = requests.get(f"{BASE_URL}/stats")
    print(f"Stats: {response.status_code} - {response.text}")
    return response.ok

if __name__ == "__main__":
    print("Testing Semantic Search API...")
    test_stats()
    test_index()
    test_stats()
    test_search()
