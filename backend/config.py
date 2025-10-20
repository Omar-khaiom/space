"""
Configuration management for Space Catalog API
Loads settings from .env file and provides typed configuration objects
"""
from pydantic_settings import BaseSettings
from typing import List
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # API Settings
    ENV: str = "development"
    DEBUG: bool = True
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 5000
    API_TITLE: str = "Space Catalog API"
    API_VERSION: str = "1.0.0"
    API_DESCRIPTION: str = "Live astronomical data from ESA Gaia DR3 and other catalogs"
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:8000,http://127.0.0.1:8000"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins into list"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./space_catalog.db"
    
    # Cache
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_ENABLED: bool = True
    CACHE_TTL_SECONDS: int = 3600
    CACHE_DB_PATH: str = "cache.db"
    
    # Gaia Archive
    GAIA_TAP_URL: str = "https://gea.esac.esa.int/tap-server/tap"
    GAIA_MAX_ROWS: int = 100000
    GAIA_TIMEOUT_SECONDS: int = 60
    
    # Query Limits
    MAX_STARS_PER_REQUEST: int = 50000
    SPATIAL_INDEX_ENABLED: bool = True
    LOD_ENABLED: bool = True
    
    # Performance
    WORKER_COUNT: int = 4
    MAX_CONCURRENT_QUERIES: int = 10
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/space_api.log"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance (singleton pattern)"""
    return Settings()


# Global settings instance
settings = get_settings()
