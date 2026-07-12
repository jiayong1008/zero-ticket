import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./zeroticket.db"
    GEMINI_API_KEY: str = ""
    # Fernet key for encrypting DB passwords at rest. Must be 32 URL-safe base64-encoded bytes.
    # No insecure default here on purpose -- see the guardrail below. Every deployment
    # (local dev included) must set its own via the ENCRYPTION_KEY env var / .env file.
    ENCRYPTION_KEY: str = ""
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

# On Vercel, everything except /tmp is a read-only filesystem. This app's
# metadata store (companies/repositories/db_connections/etc, see db.py) is
# SQLite-only -- db.py uses SQLite-specific connect_args, PRAGMAs, and raw
# "ALTER TABLE" auto-migration, so it can't simply be pointed at Postgres/MySQL
# without a real rewrite. That means the default "sqlite:///./zeroticket.db"
# (and any other relative/non-/tmp sqlite path) tries to create a file in a
# read-only directory on every cold start and crashes during app startup with
# "sqlite3.OperationalError: unable to open database file" -- before the app
# ever serves a single request. Redirect it to /tmp, which is writable.
#
# NOTE: /tmp on Vercel is ephemeral and local to one function instance -- it
# is NOT durable storage. Data written here can vanish on the next cold start
# and isn't shared across concurrent instances. This unblocks the demo (the
# app can actually boot and respond), it does not make this a real production
# datastore. The real fix is a hosted Postgres/MySQL plus reworking db.py's
# SQLite-specific code to be dialect-agnostic.
if os.getenv("VERCEL") and settings.DATABASE_URL.startswith("sqlite:///") and "/tmp/" not in settings.DATABASE_URL:
    settings.DATABASE_URL = "sqlite:////tmp/zeroticket.db"
if os.getenv("ENCRYPTION_KEY"):
    settings.ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if os.getenv("ADMIN_PASSWORD"):
    settings.ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
if os.getenv("LICENSE_KEY"):
    settings.LICENSE_KEY = os.getenv("LICENSE_KEY")
if os.getenv("CUSTOM_LLM_BASE_URL"):
    settings.CUSTOM_LLM_BASE_URL = os.getenv("CUSTOM_LLM_BASE_URL")

# --- Security guardrails -------------------------------------------------
# 1. Refuse to boot without a real encryption key. The old behavior silently
#    fell back to a key hardcoded in this file -- which is committed to a
#    public repo, so "encryption at rest" for stored DB passwords was
#    meaningless to anyone who read the source. Every environment, including
#    local dev, must now set its own ENCRYPTION_KEY.
if not settings.ENCRYPTION_KEY:
    raise RuntimeError(
        "ENCRYPTION_KEY is not set. Refusing to start: database passwords "
        "cannot be safely stored without a real, secret encryption key.\n\n"
        "Generate one with:\n"
        "  python3 -c \"import secrets, base64; "
        "print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())\"\n\n"
        "Then set it as ENCRYPTION_KEY in backend/.env (local dev) or in your "
        "host's project environment variables (e.g. Vercel/Railway settings)."
    )

# 2. Vercel automatically sets VERCEL=1 on every deployment. If we're running
#    there with no ADMIN_PASSWORD, every admin/onboarding endpoint -- including
#    the one that stores database credentials -- is reachable with zero
#    authentication. That's acceptable for pure local development only.
if os.getenv("VERCEL") and not settings.ADMIN_PASSWORD:
    raise RuntimeError(
        "ADMIN_PASSWORD is not set. Refusing to start on Vercel with all "
        "admin endpoints unauthenticated. Set ADMIN_PASSWORD in your Vercel "
        "project's Environment Variables before deploying."
    )
elif not settings.ADMIN_PASSWORD:
    print(
        "\n⚠️  WARNING: ADMIN_PASSWORD is not set. All admin/onboarding "
        "endpoints (including database credential storage) are running "
        "WITHOUT AUTHENTICATION. This is fine for local development only -- "
        "never expose this configuration publicly.\n"
    )
