import asyncio
import base64
import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse

from app.config import settings
from app.exceptions import VoicebotError, AudioError, ConfigurationError
from app.monitoring import perf_monitor
from app.pipeline import process_audio_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()

_semaphore = asyncio.Semaphore(settings.max_concurrent_requests)

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"


@router.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = _TEMPLATES_DIR / "index.html"
    return HTMLResponse(content=index_path.read_text(encoding="utf-8"))


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "configured": settings.is_configured(),
        "metrics": perf_monitor.get_avg_times(),
    }


@router.post("/process_audio")
async def process_audio_endpoint(audio: UploadFile = File(...)):
    if not settings.is_configured():
        raise HTTPException(status_code=503, detail="API keys not configured")

    wav_bytes = await audio.read()
    if not wav_bytes:
        raise HTTPException(status_code=400, detail="No audio data provided")

    async with _semaphore:
        try:
            transcript, tts_wav_bytes, ai_text = await asyncio.to_thread(
                process_audio_pipeline, wav_bytes
            )
        except AudioError as e:
            raise HTTPException(status_code=400, detail=e.user_message)
        except ConfigurationError as e:
            raise HTTPException(status_code=503, detail=e.user_message)
        except VoicebotError as e:
            raise HTTPException(status_code=502, detail=e.user_message)
        except Exception as e:
            logger.error("Unexpected error in process_audio: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Processing failed: {e}")

    audio_base64 = base64.b64encode(tts_wav_bytes).decode("utf-8")
    return {
        "transcript": transcript,
        "ai_response": ai_text,
        "audio_base64": audio_base64,
    }
