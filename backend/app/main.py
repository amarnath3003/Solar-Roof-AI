import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Tracks whether the local segmentation model loaded at startup, so /health can
# distinguish "ML serving" from "OpenCV fallback only".
ml_state = {"model_loaded": False, "detail": "not warmed up"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload the checkpoint so the first request does not pay the multi-second
    # torch/weights initialization, and so a corrupt checkpoint is visible in
    # the startup logs instead of silently degrading to the OpenCV pipeline.
    try:
        from ml.inference import RoofSegmenter

        if RoofSegmenter.shared().warmup():
            ml_state.update(model_loaded=True, detail="model loaded")
            logger.info("ML model warmed up and serving")
        else:
            ml_state.update(model_loaded=False, detail="no checkpoint; OpenCV fallback")
            logger.warning("No trained checkpoint found; serving OpenCV fallback only")
    except Exception as exc:
        ml_state.update(model_loaded=False, detail=f"model failed to load: {exc}")
        logger.exception("ML model warmup failed; serving OpenCV fallback only")
    yield


app = FastAPI(title="Solar Roof AI Detection API", version="0.1.0", lifespan=lifespan)

default_origins = "http://localhost:5173,http://127.0.0.1:5173"
allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "ml_model_loaded": ml_state["model_loaded"],
        "ml_detail": ml_state["detail"],
    }


app.include_router(v1_router, prefix="/api/v1")
