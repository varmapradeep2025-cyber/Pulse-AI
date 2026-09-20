import os
from datetime import datetime, timezone

from fastapi import FastAPI

SERVICE_NAME = os.getenv("SERVICE_NAME", "pulse-ai-ml-service")
SERVICE_VERSION = os.getenv("SERVICE_VERSION", "0.1.0")
APP_ENV = os.getenv("APP_ENV", "development")

app = FastAPI(title=SERVICE_NAME, version=SERVICE_VERSION)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": SERVICE_NAME,
        "environment": APP_ENV,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }