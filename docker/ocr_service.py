"""
OCR Service für DMSCode
Führt OCR auf Bildern und PDFs durch
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pytesseract
from PIL import Image
from pdf2image import convert_from_bytes
import io
import base64
import magic
from typing import Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DMSCode OCR Service",
    description="OCR Service mit Tesseract für DMSCode",
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
    file_base64: str
    language: str = "deu+eng"
    psm: int = 3  # Page segmentation mode

class OcrResponse(BaseModel):
    text: str
    confidence: float
    language: str
    pages: int

@app.get("/health")
async def health():
    """Health Check"""
    return {"status": "healthy", "service": "ocr"}

@app.post("/ocr", response_model=OcrResponse)
async def perform_ocr(request: OcrRequest):
    """
    Führt OCR auf Base64-encoded Datei durch
    """
    try:
        # Decode Base64
        file_bytes = base64.b64decode(request.file_base64)
        
        # Dateityp erkennen
        mime_type = magic.from_buffer(file_bytes, mime=True)
        logger.info(f"Processing file with MIME type: {mime_type}")
        
        texts = []
        confidences = []
        
        if mime_type == "application/pdf":
            # PDF zu Bildern konvertieren
            images = convert_from_bytes(file_bytes, dpi=300)
            for i, image in enumerate(images):
                logger.info(f"Processing PDF page {i+1}/{len(images)}")
                data = pytesseract.image_to_data(
                    image, 
                    lang=request.language,
                    output_type=pytesseract.Output.DICT
                )
                page_text = pytesseract.image_to_string(image, lang=request.language)
                texts.append(page_text)
                
                # Confidence berechnen
                confs = [int(c) for c in data['conf'] if c != '-1']
                if confs:
                    confidences.append(sum(confs) / len(confs))
                    
            pages = len(images)
        else:
            # Bild direkt verarbeiten
            image = Image.open(io.BytesIO(file_bytes))
            
            # OCR mit Confidence-Daten
            data = pytesseract.image_to_data(
                image,
                lang=request.language,
                output_type=pytesseract.Output.DICT
            )
            text = pytesseract.image_to_string(image, lang=request.language)
            texts.append(text)
            
            confs = [int(c) for c in data['conf'] if c != '-1']
            if confs:
                confidences.append(sum(confs) / len(confs))
            
            pages = 1
        
        # Ergebnis zusammenfügen
        full_text = "\n\n---PAGE BREAK---\n\n".join(texts)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        return OcrResponse(
            text=full_text,
            confidence=avg_confidence / 100.0,
            language=request.language,
            pages=pages
        )
        
    except Exception as e:
        logger.error(f"OCR error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

@app.post("/ocr/upload")
async def ocr_upload(
    file: UploadFile = File(...),
    language: str = "deu+eng"
):
    """
    Führt OCR auf hochgeladener Datei durch
    """
    try:
        contents = await file.read()
        request = OcrRequest(
            file_base64=base64.b64encode(contents).decode(),
            language=language
        )
        return await perform_ocr(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
