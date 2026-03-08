import logging
import time

from app.audio import validate_wav_bytes
from app.cache import memory_cache
from app.config import settings
from app.exceptions import AudioError
from app.monitoring import PerformanceMetrics, perf_monitor
from app.services.llm import generate_llm_response, generate_llm_response_with_history
from app.services.transcription import transcribe_audio_bytes
from app.services.tts import generate_tts_audio_bytes
from app.prompts import build_interview_prompt, build_opening_instruction

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


def process_turn_pipeline(
    session: "InterviewSession",
    wav_bytes: bytes,
) -> tuple[str, bytes, str]:
    """Process one answer turn within a multi-turn interview session.

    Returns (transcript, tts_wav_bytes, ai_response_text).
    LLM response is NOT cached (context changes each turn).
    TTS response IS cached (same text = same audio).
    """
    from app.session import InterviewSession  # local import to avoid circular

    # 1. Validate audio
    validate_wav_bytes(wav_bytes)

    # 2. Transcribe
    transcript = transcribe_audio_bytes(wav_bytes)
    logger.info("Turn transcript: %s…", transcript[:80])

    # 3. Append user message to session history
    session.conversation_history.append({"role": "user", "content": transcript})

    # 4. Build dynamic system prompt and generate response (no cache)
    system_prompt = build_interview_prompt(
        difficulty=session.difficulty,
        topic=session.topic,
        resume_text=session.resume_text,
    )
    ai_text = generate_llm_response_with_history(
        system_prompt=system_prompt,
        conversation_history=session.conversation_history[:-1],  # exclude current user msg (already in messages)
        user_text=transcript,
    )
    logger.info("Turn AI response: %s…", ai_text[:80])

    # 5. Append assistant response to session history
    session.conversation_history.append({"role": "assistant", "content": ai_text})

    # 6. TTS (cached — same text always gives same audio)
    tts_bytes = generate_tts_audio_bytes(ai_text)

    return transcript, tts_bytes, ai_text
