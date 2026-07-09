from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    REPLICATE_API_TOKEN: str
    # Shared secret guarding the paid /api/process endpoint. Sent by clients as
    # the X-API-Key header. Empty by default so the endpoint fails CLOSED: with
    # no key configured, every request is rejected (this guards a metered,
    # per-call-cost Replicate pipeline). Set it in backend/.env for local dev
    # and as a Railway env var in production.
    PROCESS_API_KEY: str = ""
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8000"]
    MAX_UPLOAD_MB: int = 100
    LIBRARY_DIR: str = "/data/library"

    class Config:
        env_file = ".env"


settings = Settings()
