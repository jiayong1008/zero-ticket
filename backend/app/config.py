import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./zeroticket.db"
    GEMINI_API_KEY: str = ""
    # Fernet key for encrypting DB passwords at rest. Must be 32 URL-safe base64-encoded bytes.
    # We generate a temporary fallback if not provided, but in production this must be stable.
    ENCRYPTION_KEY: str = "tVv5F3a7-wM7o79P56s4lCq8z46p9u8r5y6_1A3B-CE=" 
    ADMIN_PASSWORD: str = ""
    LICENSE_KEY: str = ""
    CUSTOM_LLM_BASE_URL: str = "http://localhost:11434/v1"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()

# Ensure we overwrite with actual environment variables if present
if os.getenv("GEMINI_API_KEY"):
    settings.GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if os.getenv("DATABASE_URL"):
    settings.DATABASE_URL = os.getenv("DATABASE_URL")
if os.getenv("ENCRYPTION_KEY"):
    settings.ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if os.getenv("ADMIN_PASSWORD"):
    settings.ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
if os.getenv("LICENSE_KEY"):
    settings.LICENSE_KEY = os.getenv("LICENSE_KEY")
if os.getenv("CUSTOM_LLM_BASE_URL"):
    settings.CUSTOM_LLM_BASE_URL = os.getenv("CUSTOM_LLM_BASE_URL")
