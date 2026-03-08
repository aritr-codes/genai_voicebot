from unittest.mock import patch, MagicMock

import pytest

from app.exceptions import AudioError, TranscriptionError, LLMError, TTSError


class TestProcessAudioPipeline:
    @patch("app.pipeline.generate_tts_audio_bytes")
    @patch("app.pipeline.generate_llm_response")
    @patch("app.pipeline.transcribe_audio_bytes")
    @patch("app.pipeline.validate_wav_bytes")
    def test_full_pipeline_success(self, mock_validate, mock_transcribe, mock_llm, mock_tts, sample_wav_bytes):
        mock_validate.return_value = (True, None, 1.0)
        mock_transcribe.return_value = "What is machine learning?"
        mock_llm.return_value = "Machine learning is a subset of AI."
        mock_tts.return_value = b"fake_tts_audio_bytes"

        from app.pipeline import process_audio_pipeline

        transcript, tts_bytes, ai_text = process_audio_pipeline(sample_wav_bytes)

        assert transcript == "What is machine learning?"
        assert ai_text == "Machine learning is a subset of AI."
        assert tts_bytes == b"fake_tts_audio_bytes"
        mock_transcribe.assert_called_once()
        mock_llm.assert_called_once_with("What is machine learning?")

    @patch("app.pipeline.validate_wav_bytes")
    def test_validation_failure_raises(self, mock_validate, sample_wav_bytes):
        mock_validate.return_value = (False, "Audio too short", None)

        from app.pipeline import process_audio_pipeline

        with pytest.raises(AudioError, match="Audio too short"):
            process_audio_pipeline(sample_wav_bytes)

    def test_empty_bytes_raises(self):
        from app.pipeline import process_audio_pipeline

        with pytest.raises(AudioError, match="No audio"):
            process_audio_pipeline(b"")

    @patch("app.pipeline.transcribe_audio_bytes")
    @patch("app.pipeline.validate_wav_bytes")
    def test_transcription_error_propagates(self, mock_validate, mock_transcribe, sample_wav_bytes):
        mock_validate.return_value = (True, None, 1.0)
        mock_transcribe.side_effect = TranscriptionError("No speech detected")

        from app.pipeline import process_audio_pipeline

        with pytest.raises(TranscriptionError):
            process_audio_pipeline(sample_wav_bytes)

    @patch("app.pipeline.generate_llm_response")
    @patch("app.pipeline.transcribe_audio_bytes")
    @patch("app.pipeline.validate_wav_bytes")
    def test_llm_error_propagates(self, mock_validate, mock_transcribe, mock_llm, sample_wav_bytes):
        mock_validate.return_value = (True, None, 1.0)
        mock_transcribe.return_value = "test question"
        mock_llm.side_effect = LLMError("API timeout")

        from app.pipeline import process_audio_pipeline

        with pytest.raises(LLMError):
            process_audio_pipeline(sample_wav_bytes)

    @patch("app.pipeline.generate_tts_audio_bytes")
    @patch("app.pipeline.generate_llm_response")
    @patch("app.pipeline.transcribe_audio_bytes")
    @patch("app.pipeline.validate_wav_bytes")
    def test_cache_hit_skips_llm(self, mock_validate, mock_transcribe, mock_llm, mock_tts, sample_wav_bytes):
        mock_validate.return_value = (True, None, 1.0)
        mock_transcribe.return_value = "cached question"
        mock_llm.return_value = "cached answer"
        mock_tts.return_value = b"cached_audio"

        from app.pipeline import process_audio_pipeline
        from app.cache import memory_cache

        # First call populates cache
        process_audio_pipeline(sample_wav_bytes)
        mock_llm.reset_mock()

        # Second call with same transcript should hit LLM cache
        mock_transcribe.return_value = "cached question"
        process_audio_pipeline(sample_wav_bytes)

        # LLM should not be called again (cache hit)
        mock_llm.assert_not_called()
