import io
import logging

import numpy as np
import soundfile as sf

from app.config import settings
from app.exceptions import AudioError

logger = logging.getLogger(__name__)


def numpy_to_wav_bytes(audio_tuple: tuple) -> bytes:
    try:
        sr, data = audio_tuple
        if data is None:
            raise AudioError("Audio data is None")
        if not isinstance(data, np.ndarray):
            data = np.array(data)
        if data.size == 0:
            raise AudioError("Audio data is empty")

        # Downsample if needed
        if sr > 16000:
            from scipy import signal

            downsample_factor = sr // 16000
            if downsample_factor > 1:
                data = signal.decimate(data, downsample_factor, zero_phase=True)
                sr = sr // downsample_factor
                logger.info("Downsampled audio from %dHz to %dHz", sr * downsample_factor, sr)

        # Convert to mono
        if data.ndim > 1:
            data = np.mean(data, axis=1)

        # Normalize dtype to float32
        if data.dtype != np.float32:
            if data.dtype == np.int16:
                data = data.astype(np.float32) / 32768.0
            elif data.dtype == np.int32:
                data = data.astype(np.float32) / 2147483648.0
            else:
                data = data.astype(np.float32)

        # Gain adjustment for quiet audio
        peak = float(np.max(np.abs(data))) if data.size > 0 else 0.0
        if 0.001 < peak < 0.05:
            gain = min(0.25 / peak, 10.0)
            data = data * gain
            logger.info("Applied gain adjustment: %.2fx", gain)
        data = np.clip(data, -1.0, 1.0)

        # Trim silence
        non_silent = np.abs(data) > settings.silence_threshold
        if np.any(non_silent):
            indices = np.where(non_silent)[0]
            first_idx = max(0, indices[0] - int(0.1 * sr))
            last_idx = min(len(data), indices[-1] + int(0.1 * sr))
            data = data[first_idx:last_idx]

        buf = io.BytesIO()
        sf.write(buf, data, sr, format="WAV", subtype="PCM_16")
        buf.seek(0)
        wav_bytes = buf.getvalue()
        logger.info("Converted numpy audio to WAV: %d bytes, duration: %.2fs", len(wav_bytes), len(data) / sr)
        return wav_bytes
    except AudioError:
        raise
    except Exception as e:
        logger.error("Failed to convert numpy to wav bytes: %s", e)
        raise AudioError(f"Audio conversion failed: {e}", detail=str(e))


def wav_bytes_to_numpy(wav_bytes: bytes) -> tuple:
    try:
        buf = io.BytesIO(wav_bytes)
        buf.seek(0)
        data, sr = sf.read(buf, dtype="float32", always_2d=False)
        data = (np.clip(data, -1.0, 1.0) * 32767.0).astype(np.int16)
        logger.info("Converted WAV bytes to numpy: sr=%d, shape=%s", sr, data.shape)
        return sr, data
    except Exception as e:
        logger.error("Failed to convert wav bytes to numpy: %s", e)
        raise AudioError(f"Audio conversion failed: {e}", detail=str(e))


def validate_wav_bytes(wav_bytes: bytes) -> tuple[bool, str | None, float | None]:
    try:
        if not wav_bytes:
            return False, "No audio data provided.", None

        size_mb = len(wav_bytes) / (1024 * 1024)
        logger.info("Received audio: %d bytes, %.2fMB", len(wav_bytes), size_mb)

        if size_mb > settings.max_file_mb:
            return False, f"Audio too large ({size_mb:.1f}MB > {settings.max_file_mb}MB). Please record shorter audio.", None
        if len(wav_bytes) < 1000:
            return False, "Audio seems too small. Please ensure you recorded properly.", None

        try:
            buf = io.BytesIO(wav_bytes)
            with sf.SoundFile(buf) as f:
                num_frames = len(f)
                sr = f.samplerate
                channels = f.channels
                format_info = f.format
                logger.info("Audio format: %s, sample rate: %d, channels: %d, frames: %d", format_info, sr, channels, num_frames)
                duration_s = num_frames / sr

            buf.seek(0)
            data, _sr = sf.read(buf, dtype="float32", always_2d=False)
            if isinstance(data, np.ndarray):
                if data.ndim > 1:
                    data = np.mean(data, axis=1)
                rms = float(np.sqrt(np.mean(np.square(np.clip(data, -1.0, 1.0)))))
            else:
                rms = 0.0
        except Exception as e:
            logger.error("SoundFile failed to process audio: %s", e)
            try:
                import wave

                buf = io.BytesIO(wav_bytes)
                with wave.open(buf, "rb") as wf:
                    num_frames = wf.getnframes()
                    sr = wf.getframerate()
                    duration_s = num_frames / sr
                    logger.info("Fallback validation (wave): sample rate: %d, frames: %d, duration: %.2fs", sr, num_frames, duration_s)
                return True, None, duration_s
            except Exception as fallback_e:
                logger.error("Fallback validation failed: %s", fallback_e)
                return False, f"Invalid audio format: {e}. Please try recording again.", None

        if duration_s <= 0:
            return False, "Could not process audio. Please try recording again.", None
        if duration_s > settings.max_record_seconds + 2.0:
            return False, f"Recording too long ({duration_s:.1f}s > {settings.max_record_seconds}s). Please record shorter audio.", duration_s
        if duration_s < settings.min_recording_seconds:
            return False, f"Recording too short. Please speak for at least {settings.min_recording_seconds} seconds.", duration_s
        if "rms" in locals() and rms < settings.min_audio_rms:
            return False, "No speech detected in audio. Please speak louder or closer to the mic.", duration_s

        logger.info("Audio validation passed: %.2fs, %.2fMB", duration_s, size_mb)
        return True, None, duration_s
    except Exception as e:
        logger.error("Audio validation error: %s", e)
        return False, f"Error processing audio: {e}", None
