from __future__ import annotations

from fastapi import APIRouter

from app.schemas.response import ApiResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> ApiResponse:
    return ApiResponse(success=True, message="Folio is running", data={"status": "ok"})
