"""
API Routes for Star Queries
Handles real-time Gaia data requests from frontend
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Optional
from pydantic import BaseModel, Field
from loguru import logger

from services.local_catalog_service import local_catalog_service
from services.cache_service import cache_service
from config import settings


router = APIRouter(prefix="/api/stars", tags=["stars"])


# Response models
class StarResponse(BaseModel):
    """Response model for star data"""
    count: int
    stars: List[Dict]
    cached: bool = False
    query_time_ms: Optional[float] = None


class BrightCatalogResponse(BaseModel):
    """Response model for bright star catalog"""
    count: int
    stars: List[Dict]
    magnitude_limit: float
    cached: bool = False
    query_time_ms: Optional[float] = None


# Simple GET endpoint for frontend compatibility
@router.get("/region", response_model=StarResponse)
async def query_region(
    ra: float = Query(..., ge=0, le=360, description="Right ascension in degrees"),
    dec: float = Query(..., ge=-90, le=90, description="Declination in degrees"),
    radius: float = Query(5.0, gt=0, le=30, description="Search radius in degrees"),
    limit: int = Query(5000, ge=1, le=50000, description="Maximum stars to return")
):
    """
    Query stars in a region from LOCAL CATALOG (GET endpoint for frontend)
    
    Example: /api/stars/region?ra=266.4&dec=-29.0&radius=5.0&limit=1000
    """
    try:
        import time
        start_time = time.time()
        
        # Check cache
        cache_key = f"stars:region:{ra:.2f}:{dec:.2f}:{radius:.2f}:{limit}"
        
        cached_result = await cache_service.get(cache_key)
        if cached_result:
            return StarResponse(
                count=len(cached_result),
                stars=cached_result,
                cached=True,
                query_time_ms=0
            )
        
        # Query LOCAL CATALOG (fast SQLite query, no network calls)
        stars = await local_catalog_service.query_nearby_stars_async(
            camera_x=0,  # Will implement proper camera position later
            camera_y=0,
            camera_z=0,
            max_distance=1000.0,  # parsecs
            mag_limit=12.0  # Show dimmer stars in zoomed regions
        )
        
        # Cache result
        await cache_service.set(cache_key, stars)
        
        query_time = (time.time() - start_time) * 1000
        
        logger.info(f"Region query returned {len(stars)} stars in {query_time:.2f}ms (RA={ra:.2f}, Dec={dec:.2f}, R={radius:.2f}°)")
        
        return StarResponse(
            count=len(stars),
            stars=stars,
            cached=False,
            query_time_ms=query_time
        )
        
    except Exception as e:
        logger.error(f"Region query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bright-catalog", response_model=BrightCatalogResponse)
async def get_bright_catalog(
    mag_limit: float = Query(7.0, ge=1.0, le=10.0, description="Magnitude limit (brighter = lower number)")
):
    """
    Get full-sky catalog of bright stars from LOCAL DATABASE
    This is the base layer for planetarium view - loads once at startup
    
    Default mag_limit=7.0 returns ~20,000 stars from local Gaia catalog
    
    Example: /api/stars/bright-catalog?mag_limit=7.0
    """
    try:
        import time
        start_time = time.time()
        
        # Cache key for bright catalog
        cache_key = f"stars:bright_catalog:{mag_limit}"
        
        cached_result = await cache_service.get(cache_key)
        if cached_result:
            logger.info(f"Returning cached bright catalog ({len(cached_result)} stars, mag<{mag_limit})")
            return BrightCatalogResponse(
                count=len(cached_result),
                stars=cached_result,
                magnitude_limit=mag_limit,
                cached=True,
                query_time_ms=0
            )
        
        # Query all bright stars from LOCAL CATALOG
        logger.info(f"Querying local catalog for bright stars (mag < {mag_limit})...")
        
        # Use local catalog service (no network calls!)
        stars = await local_catalog_service.query_all_bright_stars_async(mag_limit=mag_limit)
        
        # Cache permanently (bright stars don't change)
        await cache_service.set(cache_key, stars)
        
        query_time = (time.time() - start_time) * 1000
        
        logger.success(f"Bright catalog query returned {len(stars)} stars in {query_time:.2f}ms (mag<{mag_limit})")
        
        return BrightCatalogResponse(
            count=len(stars),
            stars=stars,
            magnitude_limit=mag_limit,
            cached=False,
            query_time_ms=query_time
        )
        
    except Exception as e:
        logger.error(f"Bright catalog query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ConeQueryParams(BaseModel):
    """Parameters for cone search query"""
    ra: float = Field(..., ge=0, le=360, description="Right ascension in degrees")
    dec: float = Field(..., ge=-90, le=90, description="Declination in degrees")
    radius: float = Field(..., gt=0, le=10, description="Search radius in degrees")
    max_stars: int = Field(10000, ge=1, le=100000, description="Maximum stars to return")
    min_magnitude: float = Field(20.0, ge=0, le=25, description="Faintest magnitude")


class FrustumQueryParams(BaseModel):
    """Parameters for camera frustum query"""
    camera_x: float = Field(..., description="Camera X position (parsecs)")
    camera_y: float = Field(..., description="Camera Y position (parsecs)")
    camera_z: float = Field(..., description="Camera Z position (parsecs)")
    direction_x: float = Field(..., description="View direction X (normalized)")
    direction_y: float = Field(..., description="View direction Y (normalized)")
    direction_z: float = Field(..., description="View direction Z (normalized)")
    fov: float = Field(50.0, ge=1, le=120, description="Field of view in degrees")
    max_distance: float = Field(1000.0, ge=1, description="Max query distance (parsecs)")
    max_stars: int = Field(50000, ge=1, le=100000, description="Maximum stars")


@router.post("/cone", response_model=StarResponse)
async def query_cone(params: ConeQueryParams):
    """
    Query stars in a cone around specified sky coordinates
    
    Example:
    ```json
    {
        "ra": 266.4,
        "dec": -29.0,
        "radius": 5.0,
        "max_stars": 10000,
        "min_magnitude": 18.0
    }
    ```
    """
    try:
        import time
        start_time = time.time()
        
        # Check cache
        cache_key = {
            "type": "cone",
            "ra": round(params.ra, 4),
            "dec": round(params.dec, 4),
            "radius": round(params.radius, 4),
            "max_stars": params.max_stars,
            "min_mag": params.min_magnitude
        }
        
        cached_result = await cache_service.get(cache_key)
        if cached_result:
            return StarResponse(
                count=len(cached_result),
                stars=cached_result,
                cached=True
            )
        
        # Query Gaia
        stars = await gaia_service.query_cone_async(
            ra=params.ra,
            dec=params.dec,
            radius_deg=params.radius,
            max_stars=params.max_stars,
            min_magnitude=params.min_magnitude
        )
        
        # Cache result
        await cache_service.set(cache_key, stars)
        
        query_time = (time.time() - start_time) * 1000
        
        logger.info(f"Cone query returned {len(stars)} stars in {query_time:.2f}ms")
        
        return StarResponse(
            count=len(stars),
            stars=stars,
            cached=False,
            query_time_ms=query_time
        )
        
    except Exception as e:
        logger.error(f"Cone query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.post("/frustum", response_model=StarResponse)
async def query_frustum(params: FrustumQueryParams):
    """
    Query stars visible in camera frustum (optimized for viewer)
    
    Example:
    ```json
    {
        "camera_x": 0.0,
        "camera_y": 0.0,
        "camera_z": 0.0,
        "direction_x": 1.0,
        "direction_y": 0.0,
        "direction_z": 0.0,
        "fov": 50.0,
        "max_distance": 1000.0,
        "max_stars": 50000
    }
    ```
    """
    try:
        import time
        start_time = time.time()
        
        # Check cache
        cache_key = {
            "type": "frustum",
            "cam": [
                round(params.camera_x, 2),
                round(params.camera_y, 2),
                round(params.camera_z, 2)
            ],
            "dir": [
                round(params.direction_x, 3),
                round(params.direction_y, 3),
                round(params.direction_z, 3)
            ],
            "fov": round(params.fov, 1),
            "dist": round(params.max_distance, 1),
            "max": params.max_stars
        }
        
        cached_result = await cache_service.get(cache_key)
        if cached_result:
            return StarResponse(
                count=len(cached_result),
                stars=cached_result,
                cached=True
            )
        
        # Query Gaia based on view frustum
        stars = await gaia_service.query_frustum_async(
            camera_position=(params.camera_x, params.camera_y, params.camera_z),
            camera_direction=(params.direction_x, params.direction_y, params.direction_z),
            fov_deg=params.fov,
            max_distance=params.max_distance,
            max_stars=params.max_stars
        )
        
        # Cache result
        await cache_service.set(cache_key, stars)
        
        query_time = (time.time() - start_time) * 1000
        
        logger.info(f"Frustum query returned {len(stars)} stars in {query_time:.2f}ms")
        
        return StarResponse(
            count=len(stars),
            stars=stars,
            cached=False,
            query_time_ms=query_time
        )
        
    except Exception as e:
        logger.error(f"Frustum query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.get("/galactic-center")
async def query_galactic_center(
    radius: float = Query(5.0, ge=0.1, le=20.0, description="Radius in degrees"),
    max_stars: int = Query(50000, ge=100, le=100000)
):
    """
    Quick query for Galactic Center region (Sagittarius A*)
    
    Coordinates: RA = 266.4°, DEC = -29.0°
    """
    return await query_cone(ConeQueryParams(
        ra=266.4,
        dec=-29.0,
        radius=radius,
        max_stars=max_stars,
        min_magnitude=18.0
    ))
