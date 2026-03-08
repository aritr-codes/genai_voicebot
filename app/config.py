from pathlib import Path
from typing import List

from pydantic import SecretStr
from pydantic_settings import BaseSettings


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # API keys
    openai_api_key: SecretStr = SecretStr("")
    assemblyai_api_key: SecretStr = SecretStr("")
    elevenlabs_api_key: SecretStr = SecretStr("")

    # Model configuration
    openai_model: str = "gpt-3.5-turbo"
    llm_max_tokens: int = 200
    llm_temperature: float = 0.7
    llm_presence_penalty: float = 0.1
    llm_frequency_penalty: float = 0.1

    # TTS configuration
    tts_voice_id: str = "3gsg3cxXyFLcGIfNbM6C"
    tts_sample_rate: int = 22050
    tts_channels: int = 1

    # Audio validation
    max_record_seconds: int = 30
    max_file_mb: int = 5
    silence_threshold: float = 0.01
    min_audio_rms: float = 0.0005
    min_recording_seconds: float = 0.3

    # Cache
    cache_ttl_hours: int = 24
    cache_max_entries: int = 100

    # Server
    request_timeout_seconds: int = 45
    max_concurrent_requests: int = 3
    cors_origins: List[str] = ["*"]
    port: int = 7860
    log_level: str = "INFO"

    # Paths
    system_prompt_path: Path = PROJECT_ROOT / "prompts" / "interview_system.txt"

    model_config = {
        "env_file": str(PROJECT_ROOT / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    def is_configured(self) -> bool:
        return all([
            self.openai_api_key.get_secret_value(),
            self.assemblyai_api_key.get_secret_value(),
            self.elevenlabs_api_key.get_secret_value(),
        ])

    def config_status(self) -> dict[str, bool]:
        return {
            "OPENAI_API_KEY": bool(self.openai_api_key.get_secret_value()),
            "ASSEMBLYAI_API_KEY": bool(self.assemblyai_api_key.get_secret_value()),
            "ELEVENLABS_API_KEY": bool(self.elevenlabs_api_key.get_secret_value()),
        }

    def load_system_prompt(self) -> str:
        return self.system_prompt_path.read_text(encoding="utf-8")


settings = Settings()
