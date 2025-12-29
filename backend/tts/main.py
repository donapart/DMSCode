"""
DMSCode TTS Service
Text-to-Speech Service mit Piper
"""

import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI(
    title="DMSCode TTS Service",
    description="Text-to-Speech mit Piper",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Konfiguration
PIPER_MODELS_PATH = os.getenv("PIPER_MODELS_PATH", "./models")
DEFAULT_VOICE = os.getenv("DEFAULT_VOICE", "de_DE-thorsten-low")

class SynthesizeRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE
    speed: float = 1.0

class VoiceInfo(BaseModel):
    id: str
    name: str
    language: str
    quality: str

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "tts", "default_voice": DEFAULT_VOICE}

@app.get("/voices", response_model=list[VoiceInfo])
async def list_voices():
    """
    Verfügbare Stimmen auflisten
    """
    voices = []
    models_path = Path(PIPER_MODELS_PATH)
    
    if models_path.exists():
        for model_file in models_path.glob("*.onnx"):
            voice_id = model_file.stem
            # Parse voice name
            parts = voice_id.split("-")
            language = parts[0] if parts else "unknown"
            name = parts[1] if len(parts) > 1 else voice_id
            quality = parts[2] if len(parts) > 2 else "medium"
            
            voices.append(VoiceInfo(
                id=voice_id,
                name=name,
                language=language,
                quality=quality
            ))
    
    # Standard-Stimmen hinzufügen falls leer
    if not voices:
        voices = [
            VoiceInfo(id="de_DE-thorsten-low", name="Thorsten", language="de_DE", quality="low"),
            VoiceInfo(id="de_DE-thorsten-medium", name="Thorsten", language="de_DE", quality="medium"),
            VoiceInfo(id="en_US-lessac-medium", name="Lessac", language="en_US", quality="medium"),
        ]
    
    return voices

@app.post("/synthesize")
async def synthesize_speech(request: SynthesizeRequest):
    """
    Text in Sprache umwandeln
    
    Returns: WAV-Audiodatei
    """
    try:
        # Prüfe ob Piper verfügbar ist
        try:
            from piper import PiperVoice
        except ImportError:
            # Fallback: Externe piper CLI nutzen
            return await synthesize_with_cli(request)
        
        # Piper Voice laden
        model_path = Path(PIPER_MODELS_PATH) / f"{request.voice}.onnx"
        config_path = Path(PIPER_MODELS_PATH) / f"{request.voice}.onnx.json"
        
        if not model_path.exists():
            raise HTTPException(status_code=404, detail=f"Stimme nicht gefunden: {request.voice}")
        
        voice = PiperVoice.load(str(model_path), str(config_path))
        
        # Audio generieren
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            with open(tmp.name, "wb") as audio_file:
                voice.synthesize(request.text, audio_file)
            
            return FileResponse(
                tmp.name,
                media_type="audio/wav",
                filename="speech.wav"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS-Fehler: {str(e)}")

async def synthesize_with_cli(request: SynthesizeRequest):
    """
    Fallback: Piper CLI nutzen
    """
    import subprocess
    
    model_path = Path(PIPER_MODELS_PATH) / f"{request.voice}.onnx"
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        try:
            # Piper CLI aufrufen
            process = subprocess.run(
                [
                    "piper",
                    "--model", str(model_path),
                    "--output_file", tmp.name
                ],
                input=request.text.encode(),
                capture_output=True,
                timeout=60
            )
            
            if process.returncode != 0:
                raise HTTPException(
                    status_code=500, 
                    detail=f"Piper Fehler: {process.stderr.decode()}"
                )
            
            return FileResponse(
                tmp.name,
                media_type="audio/wav",
                filename="speech.wav"
            )
        
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="TTS Timeout")
        except FileNotFoundError:
            raise HTTPException(
                status_code=503, 
                detail="Piper nicht installiert. Bitte Piper TTS installieren."
            )

@app.post("/synthesize/stream")
async def synthesize_stream(request: SynthesizeRequest):
    """
    Text in Sprache umwandeln (Streaming)
    
    Für längere Texte - generiert Audio in Chunks
    """
    # TODO: Streaming-Implementierung
    return await synthesize_speech(request)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8505)
