import logging
import time

from app.audio import validate_wav_bytes
from app.cache import memory_cache
from app.config import settings
from app.exceptions import AudioError
from app.monitoring import PerformanceMetrics, perf_monitor
from app.services.llm import generate_llm_response
from app.services.transcription import transcribe_audio_bytes
from app.services.tts import generate_tts_audio_bytes

logger = logging.getLogger(__name__)


def process_audio_pipeline(
    wav_bytes: bytes,
    voice: str | None = None,
    speed: float = 1.0,
) -> tuple[str, bytes, str]:
    """Process audio through the full pipeline: validate → transcribe → LLM → TTS.

    Returns:
        (transcript, tts_wav_bytes, ai_response_text)

    Raises:
        AudioError: If audio validation fails.
        TranscriptionError: If speech-to-text fails.
        LLMError: If response generation fails.
        TTSError: If text-to-speech fails.
    """
    voice = voice or settings.tts_voice_id
    metrics = PerformanceMetrics()
    pipeline_start = time.perf_counter()

    logger.info("Starting pipeline: voice=%s, speed=%s", voice, speed)

    if not wav_bytes:
        raise AudioError("No audio provided.")

    # Validate
    ok, msg, duration_s = validate_wav_bytes(wav_bytes)
    if not ok:
        raise AudioError(msg or "Audio validation failed")
    metrics.audio_duration = duration_s or 0

    # Transcribe
    transcription_start = time.perf_counter()
    transcript = transcribe_audio_bytes(wav_bytes)
    metrics.transcription_time = time.perf_counter() - transcription_start
    logger.info("Transcription completed in %.0fms", metrics.transcription_time * 1000)

    # LLM response (with cache)
    cached_response = memory_cache.get(transcript, "gpt", 1.0)
    if cached_response:
        ai_text, _ = cached_response
        metrics.cache_hit = True
        logger.info("LLM cache hit")
    else:
        llm_start = time.perf_counter()
        ai_text = generate_llm_response(transcript)
        memory_cache.set(transcript, "gpt", 1.0, ai_text, b"")
        metrics.llm_time = time.perf_counter() - llm_start
        logger.info("LLM completed in %.0fms", metrics.llm_time * 1000)

    # TTS (with cache)
    cached_tts = memory_cache.get(f"tts_{ai_text}", voice, speed)
    if cached_tts:
        _, tts_wav_bytes = cached_tts
        metrics.cache_hit = True
        logger.info("TTS cache hit")
    else:
        tts_start = time.perf_counter()
        tts_wav_bytes = generate_tts_audio_bytes(ai_text, voice=voice, speed=speed)
        memory_cache.set(f"tts_{ai_text}", voice, speed, ai_text, tts_wav_bytes)
        metrics.tts_time = time.perf_counter() - tts_start
        logger.info("TTS completed in %.0fms", metrics.tts_time * 1000)

    metrics.total_time = time.perf_counter() - pipeline_start
    perf_monitor.add_metrics(metrics)
    logger.info("Pipeline completed in %.0fms", metrics.total_time * 1000)

    return transcript, tts_wav_bytes, ai_text
