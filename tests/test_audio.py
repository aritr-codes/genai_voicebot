import io

import numpy as np
import pytest

from app.audio import numpy_to_wav_bytes, wav_bytes_to_numpy, validate_wav_bytes
from app.exceptions import AudioError


class TestValidateWavBytes:
    def test_valid_audio(self, sample_wav_bytes):
        ok, msg, duration = validate_wav_bytes(sample_wav_bytes)
        assert ok is True
        assert msg is None
        assert duration is not None
        assert 0.9 < duration < 1.1

    def test_empty_bytes(self):
        ok, msg, duration = validate_wav_bytes(b"")
        assert ok is False
        assert "No audio" in msg

    def test_none_bytes(self):
        ok, msg, duration = validate_wav_bytes(None)
        assert ok is False

    def test_too_small(self):
        ok, msg, duration = validate_wav_bytes(b"tiny")
        assert ok is False
        assert "too small" in msg

    def test_too_short(self, short_wav_bytes):
        ok, msg, duration = validate_wav_bytes(short_wav_bytes)
        assert ok is False
        assert "too short" in msg.lower()

    def test_silence_detection(self, silent_wav_bytes):
        ok, msg, duration = validate_wav_bytes(silent_wav_bytes)
        assert ok is False
        assert "No speech" in msg


class TestNumpyToWavBytes:
    def test_basic_conversion(self):
        sr = 16000
        data = np.sin(np.linspace(0, 2 * np.pi * 440, sr)).astype(np.float32) * 0.5
        wav_bytes = numpy_to_wav_bytes((sr, data))
        assert len(wav_bytes) > 0
        assert wav_bytes[:4] == b"RIFF"

    def test_int16_input(self):
        sr = 16000
        data = (np.sin(np.linspace(0, 2 * np.pi * 440, sr)) * 16000).astype(np.int16)
        wav_bytes = numpy_to_wav_bytes((sr, data))
        assert len(wav_bytes) > 0

    def test_stereo_input(self):
        sr = 16000
        mono = np.sin(np.linspace(0, 2 * np.pi * 440, sr)).astype(np.float32) * 0.5
        stereo = np.column_stack([mono, mono])
        wav_bytes = numpy_to_wav_bytes((sr, stereo))
        assert len(wav_bytes) > 0

    def test_empty_data_raises(self):
        with pytest.raises(AudioError):
            numpy_to_wav_bytes((16000, np.array([])))

    def test_none_data_raises(self):
        with pytest.raises(AudioError):
            numpy_to_wav_bytes((16000, None))


class TestWavBytesRoundTrip:
    def test_roundtrip(self):
        sr = 16000
        original = np.sin(np.linspace(0, 2 * np.pi * 440, sr)).astype(np.float32) * 0.5
        wav_bytes = numpy_to_wav_bytes((sr, original))
        sr_out, data_out = wav_bytes_to_numpy(wav_bytes)
        assert sr_out == sr
        assert len(data_out) > 0
