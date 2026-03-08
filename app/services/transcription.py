import logging

import httpx

from app.config import settings
from app.exceptions import TranscriptionError, ConfigurationError

logger = logging.getLogger(__name__)

_transcriber = None


def _get_transcriber():
    global _transcriber
    if _transcriber is None:
        try:
            import assemblyai as aai
        except ImportError:
            raise ConfigurationError("assemblyai package is not installed")
        api_key = settings.assemblyai_api_key.get_secret_value()
        if not api_key:
            raise ConfigurationError("ASSEMBLYAI_API_KEY is not set")
        aai.settings.api_key = api_key
        _transcriber = aai.Transcriber()
    return _transcriber


def _upload_to_assemblyai(wav_bytes: bytes) -> str:
    api_key = settings.assemblyai_api_key.get_secret_value()
    if not api_key:
        raise ConfigurationError("ASSEMBLYAI_API_KEY is not configured")
    try:
        headers = {"authorization": api_key}
        resp = httpx.post(
            "https://api.assemblyai.com/v2/upload",
            headers=headers,
            content=wav_bytes,
            timeout=settings.request_timeout_seconds,
        )
        resp.raise_for_status()
        upload_url = resp.json().get("upload_url", "")
        if not upload_url:
            raise TranscriptionError("No upload URL received from AssemblyAI")
        logger.info("Uploaded %d bytes to AssemblyAI", len(wav_bytes))
        return upload_url
    except (TranscriptionError, ConfigurationError):
        raise
    except Exception as e:
        logger.error("AssemblyAI upload failed: %s", e)
        raise TranscriptionError(f"Failed to upload audio for transcription: {e}", detail=str(e))


def transcribe_audio_bytes(wav_bytes: bytes) -> str:
    try:
        import assemblyai as aai
    except ImportError:
        raise ConfigurationError("assemblyai package is not installed")

    try:
        upload_url = _upload_to_assemblyai(wav_bytes)

        # Primary config with language detection
        try:
            primary_config = aai.TranscriptionConfig(
                language_detection=True,
                punctuate=True,
                format_text=True,
            )
            transcript = _get_transcriber().transcribe(upload_url, config=primary_config)
        except Exception as e:
            logger.warning("Primary transcription failed: %s. Trying fallback.", e)
            fallback_config = aai.TranscriptionConfig(
                language_detection=False,
                language_code="en",
                punctuate=True,
                format_text=True,
            )
            transcript = _get_transcriber().transcribe(upload_url, config=fallback_config)

        # Retry with fallback if not completed
        if transcript.status != aai.TranscriptStatus.completed:
            err_msg = getattr(transcript, "error", "") or ""
            logger.warning("Primary transcription status %s. Error: %s. Retrying.", transcript.status, err_msg)
            fallback_config = aai.TranscriptionConfig(
                language_detection=False,
                language_code="en",
                punctuate=True,
                format_text=True,
            )
            transcript = _get_transcriber().transcribe(upload_url, config=fallback_config)

        if transcript.status != aai.TranscriptStatus.completed:
            error_msg = getattr(transcript, "error", "Transcription failed")
            if "no spoken audio" in str(error_msg).lower() or "no speech" in str(error_msg).lower():
                raise TranscriptionError("No speech detected in audio")
            raise TranscriptionError(f"Transcription failed: {error_msg}")

        text = (transcript.text or "").strip()
        if not text:
            raise TranscriptionError("No speech detected in audio")

        logger.info("Transcription successful: %d characters", len(text))
        return text
    except (TranscriptionError, ConfigurationError):
        raise
    except Exception as e:
        logger.error("Transcription failed: %s", e)
        raise TranscriptionError(f"Failed to transcribe audio: {e}", detail=str(e))
