"""
Space Catalog API - FastAPI Application
Professional backend for live astronomical data streaming
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import sys
from pathlib import Path

from config import settings
from services.cache_service import cache_service
from routes.stars_api import router as stars_router


# Configure logging
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level=settings.LOG_LEVEL
)

# Create logs directory
Path("logs").mkdir(exist_ok=True)
logger.add(
    settings.LOG_FILE,
    rotation="500 MB",
    retention="10 days",
    level=settings.LOG_LEVEL
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    logger.info("🚀 Starting Space Catalog API...")
    logger.info(f"Environment: {settings.ENV}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    
    # Initialize services
    await cache_service.initialize()
    
    logger.success("✅ API ready!")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down API...")
    await cache_service.clear_expired()


# Create FastAPI app
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description=settings.API_DESCRIPTION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)


# CORS middleware - allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(stars_router)


@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "name": settings.API_TITLE,
        "version": settings.API_VERSION,
        "status": "operational",
        "docs": "/docs" if settings.DEBUG else "disabled",
        "endpoints": {
            "stars_cone": "/api/stars/cone",
            "stars_frustum": "/api/stars/frustum",
            "galactic_center": "/api/stars/galactic-center",
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    cache_stats = await cache_service.stats()
    
    return {
        "status": "healthy",
        "cache": cache_stats,
        "gaia_endpoint": settings.GAIA_TAP_URL
    }


# Backward/compat alias used by some scripts
@app.get("/api/health")
async def health_check_api_alias():
    return await health_check()


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else "An error occurred"
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
