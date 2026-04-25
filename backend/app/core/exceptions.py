from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class FolioException(Exception):
    """Base exception for Folio application."""

    def __init__(self, message: str = "An unexpected error occurred", status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class NotFoundException(FolioException):
    """Resource not found."""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message=message, status_code=404)


class BadRequestException(FolioException):
    """Bad request from client."""

    def __init__(self, message: str = "Bad request"):
        super().__init__(message=message, status_code=400)


class UnauthorizedException(FolioException):
    """Authentication required."""

    def __init__(self, message: str = "Not authenticated"):
        super().__init__(message=message, status_code=401)


class ForbiddenException(FolioException):
    """Permission denied."""

    def __init__(self, message: str = "Permission denied"):
        super().__init__(message=message, status_code=403)


class ConflictException(FolioException):
    """Resource conflict."""

    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message=message, status_code=409)


def register_exception_handlers(app: FastAPI) -> None:
    """Register custom exception handlers on the FastAPI app."""

    @app.exception_handler(FolioException)
    async def folio_exception_handler(request: Request, exc: FolioException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "message": exc.message,
                "data": None,
            },
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Internal server error",
                "data": None,
            },
        )
