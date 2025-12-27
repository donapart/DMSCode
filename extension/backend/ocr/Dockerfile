FROM python:3.11-slim

# Install OCR dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-deu \
    tesseract-ocr-eng \
    poppler-utils \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
RUN pip install --no-cache-dir flask ocrmypdf python-magic pillow

WORKDIR /app

# Create OCR API server
COPY ocr_server.py /app/ocr_server.py

EXPOSE 8510

CMD ["python", "ocr_server.py"]
