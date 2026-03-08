import io
import struct

import numpy as np
import pytest


@pytest.fixture
def sample_wav_bytes():
    """Generate a valid 1-second WAV file (16kHz mono sine wave)."""
    sr = 16000
    duration = 1.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # 440Hz sine wave at moderate amplitude
    data = (np.sin(2 * np.pi * 440 * t) * 0.5).astype(np.float32)

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, data, sr, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.getvalue()


@pytest.fixture
def silent_wav_bytes():
    """Generate a WAV file with near-silence (below RMS threshold)."""
    sr = 16000
    duration = 1.0
    # Very quiet noise — below min_audio_rms (0.0005)
    data = (np.random.randn(int(sr * duration)) * 0.0001).astype(np.float32)

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, data, sr, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.getvalue()


@pytest.fixture
def short_wav_bytes():
    """Generate a WAV file that's too short (0.1 seconds)."""
    sr = 16000
    duration = 0.1
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    data = (np.sin(2 * np.pi * 440 * t) * 0.5).astype(np.float32)

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, data, sr, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.getvalue()
