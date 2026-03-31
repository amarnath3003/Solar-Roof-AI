from fastapi import APIRouter, HTTPException

from app.schemas.detection import DetectionRequest, DetectionResponse
from app.services.image_processing import analyze_snapshot

router = APIRouter()


@router.post("/detect", response_model=DetectionResponse)
def detect_roof(request: DetectionRequest) -> DetectionResponse:
    try:
        return analyze_snapshot(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail="Detection pipeline failed") from exc
