import io
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from app import create_app
from app.exceptions import AudioError, TranscriptionError, ConfigurationError


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


class TestServeIndex:
    def test_get_root_returns_html(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "AI Interview Assistant" in response.text


class TestHealth:
    def test_health_returns_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "configured" in data
        assert "metrics" in data


class TestProcessAudio:
    @patch("app.routes.settings")
    def test_unconfigured_returns_503(self, mock_settings, client):
        mock_settings.is_configured.return_value = False
        mock_settings.max_concurrent_requests = 3

        response = client.post(
            "/process_audio",
            files={"audio": ("test.wav", b"fake_audio", "audio/wav")},
        )
        assert response.status_code == 503

    @patch("app.routes.process_audio_pipeline")
    @patch("app.routes.settings")
    def test_successful_processing(self, mock_settings, mock_pipeline, client):
        mock_settings.is_configured.return_value = True
        mock_settings.max_concurrent_requests = 3
        mock_pipeline.return_value = ("hello", b"wav_bytes", "ai response")

        response = client.post(
            "/process_audio",
            files={"audio": ("test.wav", b"fake_audio", "audio/wav")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["transcript"] == "hello"
        assert data["ai_response"] == "ai response"
        assert "audio_base64" in data

    @patch("app.routes.process_audio_pipeline")
    @patch("app.routes.settings")
    def test_audio_error_returns_400(self, mock_settings, mock_pipeline, client):
        mock_settings.is_configured.return_value = True
        mock_settings.max_concurrent_requests = 3
        mock_pipeline.side_effect = AudioError("Audio too short")

        response = client.post(
            "/process_audio",
            files={"audio": ("test.wav", b"fake_audio", "audio/wav")},
        )
        assert response.status_code == 400
        assert "Audio too short" in response.json()["detail"]

    @patch("app.routes.process_audio_pipeline")
    @patch("app.routes.settings")
    def test_transcription_error_returns_502(self, mock_settings, mock_pipeline, client):
        mock_settings.is_configured.return_value = True
        mock_settings.max_concurrent_requests = 3
        mock_pipeline.side_effect = TranscriptionError("No speech detected")

        response = client.post(
            "/process_audio",
            files={"audio": ("test.wav", b"fake_audio", "audio/wav")},
        )
        assert response.status_code == 502

    def test_no_file_returns_422(self, client):
        response = client.post("/process_audio")
        assert response.status_code == 422
