import os
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

SERVICE_NAME = os.getenv("SERVICE_NAME", "pulse-ai-ml-service")
SERVICE_VERSION = os.getenv("SERVICE_VERSION", "0.1.0")
APP_ENV = os.getenv("APP_ENV", "development")

app = FastAPI(title=SERVICE_NAME, version=SERVICE_VERSION)


class DemandObservation(BaseModel):
    hospitalId: int = Field(gt=0)
    medicineId: int = Field(gt=0)
    date: str
    demand: float = Field(ge=0, allow_inf_nan=False)


class ForecastComparisonRequest(BaseModel):
    rows: list[DemandObservation] = Field(min_length=1, max_length=25000)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": SERVICE_NAME,
        "environment": APP_ENV,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/forecast/compare")
def forecast_comparison(request: ForecastComparisonRequest) -> dict:
    from app.forecast_comparison import compare_forecasts

    try:
        return compare_forecasts(
            [row.model_dump() for row in request.rows]
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error