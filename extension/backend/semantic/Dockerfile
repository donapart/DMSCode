FROM python:3.11-slim

# Install CPU-only PyTorch first (saves ~2GB vs CUDA version)
RUN pip install --no-cache-dir \
    torch==2.2.0+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Pin numpy<2 for chromadb compatibility, then install remaining dependencies
RUN pip install --no-cache-dir \
    "numpy<2" \
    flask==3.0.0 \
    chromadb==0.4.22 \
    sentence-transformers==2.7.0 \
    huggingface-hub==0.23.0

# Set HuggingFace cache to persistent volume
ENV HF_HOME=/data/hf_cache
ENV TRANSFORMERS_CACHE=/data/hf_cache

WORKDIR /app

COPY semantic_server.py /app/semantic_server.py

ENV CHROMA_DB_PATH=/data/chroma

EXPOSE 8520

# Pre-download model during build for faster startup
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"

CMD ["python", "semantic_server.py"]
