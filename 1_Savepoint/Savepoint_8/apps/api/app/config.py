import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "SolarOps Clean Energy & EV Fleet Platform"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # Database Configuration
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+asyncpg://solarops:solarops_secret@localhost:5432/solarops_db"
    )
    SYNC_DATABASE_URL: str = os.getenv(
        "SYNC_DATABASE_URL",
        "postgresql://solarops:solarops_secret@localhost:5432/solarops_db"
    )
    
    # Redis Configuration
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # NATS JetStream
    NATS_URL: str = os.getenv("NATS_URL", "nats://localhost:4222")
    NATS_STREAM_NAME: str = "SOLAROPS_EVENTS"
    NATS_SUBJECT_PREFIX: str = "solarops.events"

    # AI Integration
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    class Config:
        case_sensitive = True

settings = Settings()
