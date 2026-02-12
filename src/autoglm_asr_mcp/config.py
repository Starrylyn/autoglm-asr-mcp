"""Configuration management for AutoGLM ASR MCP server."""

import os
from dataclasses import dataclass, field


@dataclass
class ASRConfig:
    """Configuration for the ASR service.
    
    All settings can be overridden via environment variables with AUTOGLM_ASR_ prefix.
    """
    
    # API settings
    api_base: str = field(
        default_factory=lambda: os.getenv(
            "AUTOGLM_ASR_API_BASE", 
            "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions"
        )
    )
    api_key: str = field(
        default_factory=lambda: os.getenv("AUTOGLM_ASR_API_KEY", "")
    )
    model: str = field(
        default_factory=lambda: os.getenv(
            "AUTOGLM_ASR_MODEL", 
            "glm-asr"
        )
    )
    
    # Audio processing settings
    max_chunk_duration: int = field(
        default_factory=lambda: int(os.getenv("AUTOGLM_ASR_MAX_CHUNK_DURATION", "25"))
    )  # seconds, leave buffer for 30s limit
    
    # Concurrency settings
    max_concurrency: int = field(
        default_factory=lambda: int(os.getenv("AUTOGLM_ASR_MAX_CONCURRENCY", "5"))
    )
    
    # Context settings
    context_max_chars: int = field(
        default_factory=lambda: int(os.getenv("AUTOGLM_ASR_CONTEXT_MAX_CHARS", "2000"))
    )
    
    # Request settings
    request_timeout: int = field(
        default_factory=lambda: int(os.getenv("AUTOGLM_ASR_REQUEST_TIMEOUT", "60"))
    )
    max_retries: int = field(
        default_factory=lambda: int(os.getenv("AUTOGLM_ASR_MAX_RETRIES", "2"))
    )
    
    def validate(self) -> None:
        """Validate configuration."""
        if not self.api_key:
            raise ValueError(
                "AUTOGLM_ASR_API_KEY environment variable is required. "
                "Get your API key from https://open.bigmodel.cn/"
            )
        if self.max_chunk_duration > 30:
            raise ValueError(
                f"max_chunk_duration ({self.max_chunk_duration}s) exceeds API limit of 30s"
            )


# Global config instance
_config: ASRConfig | None = None


def get_config() -> ASRConfig:
    """Get or create the global config instance."""
    global _config
    if _config is None:
        _config = ASRConfig()
    return _config


def reset_config() -> None:
    """Reset config (useful for testing)."""
    global _config
    _config = None
