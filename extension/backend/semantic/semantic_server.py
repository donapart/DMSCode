"""
Semantic Search Service for DMSCode
Provides REST API for vector search using ChromaDB and Sentence Transformers
"""

from flask import Flask, request, jsonify
import chromadb
from sentence_transformers import SentenceTransformer
import os
import functools

app = Flask(__name__)

API_KEY = os.environ.get('DMS_API_KEY')

def require_api_key(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if API_KEY:
            key = request.headers.get('X-API-KEY')
            if not key or key != API_KEY:
                return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Initialize model and database
print("Loading embedding model...")
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
print("Model loaded!")

print("Initializing ChromaDB...")
chroma_path = os.environ.get('CHROMA_DB_PATH', '/data/chroma')
os.makedirs(chroma_path, exist_ok=True)
chroma_client = chromadb.PersistentClient(path=chroma_path)
collection = chroma_client.get_or_create_collection('documents')
print(f"ChromaDB initialized at {chroma_path}")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'dmscode-semantic',
        'version': '1.0.0',
        'documents': collection.count(),
        'model': 'paraphrase-multilingual-MiniLM-L12-v2'
    })

@app.route('/index', methods=['POST'])
@require_api_key
def index_document():
    """Index a document for semantic search"""
    data = request.json
    doc_id = data.get('id')
    text = data.get('text')
    metadata = data.get('metadata', {})
    
    if not doc_id or not text:
        return jsonify({'error': 'id and text required'}), 400
    
    try:
        embedding = model.encode(text).tolist()
        # ChromaDB requires non-empty metadata or None
        upsert_kwargs = {
            'ids': [doc_id],
            'embeddings': [embedding],
            'documents': [text]
        }
        if metadata:  # Only add metadata if non-empty
            upsert_kwargs['metadatas'] = [metadata]
        collection.upsert(**upsert_kwargs)
        return jsonify({
            'success': True,
            'id': doc_id,
            'total_documents': collection.count()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/search', methods=['POST'])
@require_api_key
def search():
    """Semantic search endpoint"""
    data = request.json
    query = data.get('query')
    n_results = data.get('limit', 10)
    filters = data.get('filters', None)
    
    if not query:
        return jsonify({'error': 'query required'}), 400
    
    try:
        embedding = model.encode(query).tolist()
        
        search_params = {
            'query_embeddings': [embedding],
            'n_results': min(n_results, collection.count()) if collection.count() > 0 else 1
        }
        
        if filters:
            search_params['where'] = filters
        
        if collection.count() == 0:
            return jsonify({'results': [], 'total': 0})
        
        results = collection.query(**search_params)
        
        formatted_results = []
        if results['ids'] and results['ids'][0]:
            for i, doc_id in enumerate(results['ids'][0]):
                result = {
                    'id': doc_id,
                    'text': results['documents'][0][i] if results['documents'] else '',
                    'metadata': results['metadatas'][0][i] if results['metadatas'] else {},
                    'distance': results['distances'][0][i] if results['distances'] else 0
                }
                formatted_results.append(result)
        
        return jsonify({
            'results': formatted_results,
            'total': len(formatted_results),
            'query': query
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/delete', methods=['DELETE'])
def delete_document():
    """Delete a document from the index"""
    doc_id = request.args.get('id')
    if not doc_id:
        return jsonify({'error': 'id required'}), 400
    
    try:
        collection.delete(ids=[doc_id])
        return jsonify({
            'success': True,
            'id': doc_id,
            'total_documents': collection.count()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/clear', methods=['POST'])
def clear_index():
    """Clear all documents from the index"""
    try:
        # Get all IDs and delete them
        all_docs = collection.get()
        if all_docs['ids']:
            collection.delete(ids=all_docs['ids'])
        return jsonify({
            'success': True,
            'deleted': len(all_docs['ids']) if all_docs['ids'] else 0
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stats', methods=['GET'])
def get_stats():
    """Get index statistics"""
    return jsonify({
        'total_documents': collection.count(),
        'chroma_path': chroma_path,
        'model': 'paraphrase-multilingual-MiniLM-L12-v2'
    })

if __name__ == '__main__':
    print("Starting DMSCode Semantic Search Service on port 8520...")
    app.run(host='0.0.0.0', port=8520, debug=False)
