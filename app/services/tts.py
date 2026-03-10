import logging

from app.config import settings
from app.exceptions import TTSError, ConfigurationError

logger = logging.getLogger(__name__)


def generate_tts_audio_bytes(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
    if settings.tts_provider == "elevenlabs":
        return _generate_elevenlabs(text, voice=voice, speed=speed)
    return _generate_openai(text, voice=voice)


# ---------------------------------------------------------------------------
# OpenAI TTS  (no ffmpeg dependency — returns WAV directly)
# ---------------------------------------------------------------------------

def _generate_openai(text: str, voice: str | None = None) -> bytes:
    api_key = settings.openai_api_key.get_secret_value()
    if not api_key:
        raise ConfigurationError("OPENAI_API_KEY is not set")

    try:
        from openai import OpenAI
    except ImportError:
        raise ConfigurationError("openai package is not installed")

    client = OpenAI(api_key=api_key)
    tts_voice = voice or settings.openai_tts_voice
    try:
        response = client.audio.speech.create(
            model=settings.openai_tts_model,
            voice=tts_voice,
            input=text,
            response_format="wav",
        )
        wav_bytes = response.content
        if not wav_bytes or len(wav_bytes) < 100:
            raise TTSError("OpenAI TTS returned empty audio")
        logger.info("OpenAI TTS generated: %d bytes (voice=%s)", len(wav_bytes), tts_voice)
        return wav_bytes
    except (TTSError, ConfigurationError):
        raise
    except Exception as e:
        logger.error("OpenAI TTS failed: %s", e)
        raise TTSError(f"Voice generation failed: {e}", detail=str(e))


# ---------------------------------------------------------------------------
# ElevenLabs TTS  (requires ffmpeg installed on host)
# ---------------------------------------------------------------------------

def _generate_elevenlabs(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
    import io

    voice = voice or settings.tts_voice_id

    api_key = settings.elevenlabs_api_key.get_secret_value()
    if not api_key:
        raise ConfigurationError("ELEVENLABS_API_KEY is not set")

    try:
        import elevenlabs as el_mod
    except ImportError:
        raise ConfigurationError("elevenlabs package is not installed")

    try:
        client = el_mod.ElevenLabs(api_key=api_key)
        result = client.text_to_speech.convert(
            voice_id=voice,
            text=text,
            model_id=settings.tts_model_id,
        )
        mp3_bytes = b"".join(result)

        if not mp3_bytes or len(mp3_bytes) < 100:
            raise TTSError("TTS returned empty or invalid audio")

        try:
            from pydub import AudioSegment
        except ImportError:
            raise ConfigurationError("pydub package is not installed")

        mp3_buffer = io.BytesIO(mp3_bytes)
        audio_segment = AudioSegment.from_file(mp3_buffer, format="mp3")
        audio_segment = audio_segment.set_frame_rate(settings.tts_sample_rate).set_channels(settings.tts_channels)

        if speed and abs(speed - 1.0) > 0.05:
            try:
                from pydub.effects import speedup
                audio_segment = speedup(audio_segment, playback_speed=speed)
                logger.info("Applied speed adjustment: %.1fx", speed)
            except Exception as e:
                logger.warning("Speed adjustment failed: %s", e)

        try:
            from pydub.effects import normalize
            audio_segment = normalize(audio_segment)
        except Exception:
            pass

        wav_buffer = io.BytesIO()
        audio_segment.export(
            wav_buffer,
            format="wav",
            parameters=["-ac", "1", "-ar", str(settings.tts_sample_rate)],
        )
        wav_buffer.seek(0)
        wav_bytes = wav_buffer.getvalue()
        logger.info("ElevenLabs TTS generated: %d bytes", len(wav_bytes))
        return wav_bytes
    except (TTSError, ConfigurationError):
        raise
    except Exception as e:
        logger.error("TTS generation failed: %s", e)
        raise TTSError(f"Voice generation failed: {e}", detail=str(e))
