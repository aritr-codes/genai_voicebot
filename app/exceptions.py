class VoicebotError(Exception):
    """Base exception for all voicebot errors."""

    def __init__(self, user_message: str, detail: str = ""):
        self.user_message = user_message
        self.detail = detail or user_message
        super().__init__(self.user_message)


class AudioError(VoicebotError):
    """Audio validation or conversion failures."""
    pass


class TranscriptionError(VoicebotError):
    """AssemblyAI transcription failures."""
    pass


class LLMError(VoicebotError):
    """OpenAI LLM response generation failures."""
    pass


class TTSError(VoicebotError):
    """ElevenLabs text-to-speech failures."""
    pass


class ConfigurationError(VoicebotError):
    """Missing API keys or required packages."""
    pass
