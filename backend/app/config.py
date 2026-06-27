import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./zeroticket.db"
    GEMINI_API_KEY: str = ""
    # Fernet key for encrypting DB passwords at rest. Must be 32 URL-safe base64-encoded bytes.
    # We generate a temporary fallback if not provided, but in production this must be stable.
    ENCRYPTION_KEY: str = "tVv5F3a7-wM7o79P56s4lCq8z46p9u8r5y6_1A3B-CE=" 
    
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
