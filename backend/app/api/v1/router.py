from fastapi import APIRouter

from app.api.v1.endpoints.roof import router as roof_router

router = APIRouter()
router.include_router(roof_router, prefix="/roof", tags=["roof"])
