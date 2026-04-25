from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.batch import router as batch_router
from app.api.v1.books import router as books_router
from app.api.v1.browse import router as browse_router
from app.api.v1.fonts import router as fonts_router
from app.api.v1.health import router as health_router
from app.api.v1.metadata import router as metadata_router
from app.api.v1.reading import router as reading_router
from app.api.v1.scan import router as scan_router
from app.api.v1.stats import router as stats_router
from app.api.v1.upload import router as upload_router
from app.api.v1.shelves import router as shelves_router

v1_router = APIRouter(prefix="/api/v1")

v1_router.include_router(health_router)
v1_router.include_router(auth_router)
v1_router.include_router(books_router)
v1_router.include_router(upload_router)
v1_router.include_router(reading_router)
v1_router.include_router(stats_router)
v1_router.include_router(shelves_router)
v1_router.include_router(browse_router)
v1_router.include_router(admin_router)
v1_router.include_router(batch_router)
v1_router.include_router(metadata_router)
v1_router.include_router(fonts_router)
v1_router.include_router(scan_router)
