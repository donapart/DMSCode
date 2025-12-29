"""
DMSCode OCR Service
FastAPI-basierter OCR-Service für Texterkennung in PDFs und Bildern
"""

import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="DMSCode OCR Service",
    description="Texterkennung für PDFs und Bilder",
    version="1.0.0"
)

# CORS für VS Code Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OcrRequest(BaseModel):
    file: str  # Dateipfad
    language: str = "deu+eng"

class OcrResponse(BaseModel):
    text: str
    confidence: float
    language: str
    pages: int

def ocr_image(image_path: str, language: str = "deu+eng") -> tuple[str, float]:
    """OCR für ein einzelnes Bild"""
    import pytesseract
    from PIL import Image
    
    image = Image.open(image_path)
    
    # OCR mit Tesseract
    data = pytesseract.image_to_data(image, lang=language, output_type=pytesseract.Output.DICT)
    
    # Text zusammenbauen
    text_parts = []
    confidences = []
    
    for i, conf in enumerate(data['conf']):
        if int(conf) > 0:
            text_parts.append(data['text'][i])
            confidences.append(int(conf))
    
    text = ' '.join(text_parts)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
    
    return text, avg_confidence / 100

def ocr_pdf(pdf_path: str, language: str = "deu+eng") -> tuple[str, float, int]:
    """OCR für ein PDF-Dokument"""
    from pdf2image import convert_from_path
    
    # PDF in Bilder konvertieren
    images = convert_from_path(pdf_path, dpi=300)
    
    all_text = []
    all_confidences = []
    
    for i, image in enumerate(images):
        # Temporäres Bild speichern
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            image.save(tmp.name, 'PNG')
            text, confidence = ocr_image(tmp.name, language)
            all_text.append(f"--- Seite {i+1} ---\n{text}")
            all_confidences.append(confidence)
            os.unlink(tmp.name)
    
    combined_text = '\n\n'.join(all_text)
    avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0
    
    return combined_text, avg_confidence, len(images)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ocr"}

@app.post("/ocr", response_model=OcrResponse)
async def run_ocr(request: OcrRequest):
    """
    OCR für eine Datei ausführen
    
    Unterstützte Formate: PDF, PNG, JPG, JPEG, TIFF, BMP
    """
    file_path = request.file
    language = request.language
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Datei nicht gefunden: {file_path}")
    
    ext = Path(file_path).suffix.lower()
    
    try:
        if ext == '.pdf':
            text, confidence, pages = ocr_pdf(file_path, language)
        elif ext in ['.png', '.jpg', '.jpeg', '.tiff', '.bmp']:
            text, confidence = ocr_image(file_path, language)
            pages = 1
        else:
            raise HTTPException(status_code=400, detail=f"Nicht unterstütztes Format: {ext}")
        
        return OcrResponse(
            text=text,
            confidence=confidence,
            language=language,
            pages=pages
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR-Fehler: {str(e)}")

@app.post("/ocr/upload", response_model=OcrResponse)
async def upload_and_ocr(
    file: UploadFile = File(...),
    language: str = "deu+eng"
):
    """
    Datei hochladen und OCR ausführen
    """
    # Temporäre Datei erstellen
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        request = OcrRequest(file=tmp_path, language=language)
        result = await run_ocr(request)
        return result
    finally:
        os.unlink(tmp_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8510)
