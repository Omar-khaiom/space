"""
Local Gaia Catalog Service
Queries local SQLite database instead of remote TAP API
"""
import sqlite3
from typing import List, Dict, Optional
from pathlib import Path
import asyncio
from loguru import logger
import math

from config import settings


class LocalCatalogService:
    """Service for querying local Gaia catalog SQLite database"""
    
    def __init__(self, db_path: str = "data/gaia_catalog.db"):
        """Initialize with database path"""
        self.db_path = Path(db_path)
        if not self.db_path.exists():
            logger.warning(f"Catalog database not found: {self.db_path}")
            logger.warning("Run: python scripts/download_gaia_catalog.py")
        else:
            logger.info(f"Local catalog ready: {self.db_path}")
    
    async def query_nearby_stars_async(
        self,
        camera_x: float,
        camera_y: float,
        camera_z: float,
        max_distance: float = 1000.0,
        max_stars: int = 50000,
        mag_limit: float = 15.0
    ) -> List[Dict]:
        """
        Query stars near camera position (async wrapper)
        
        Args:
            camera_x, camera_y, camera_z: Camera position in parsecs
            max_distance: Maximum distance from camera (parsecs)
            max_stars: Maximum stars to return
            mag_limit: Faintest magnitude to include
        
        Returns:
            List of star dictionaries
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._query_nearby_stars_sync,
            camera_x, camera_y, camera_z, max_distance, max_stars, mag_limit
        )
    
    def _query_nearby_stars_sync(
        self,
        camera_x: float,
        camera_y: float,
        camera_z: float,
        max_distance: float,
        max_stars: int,
        mag_limit: float
    ) -> List[Dict]:
        """Synchronous nearby star query"""
        
        if not self.db_path.exists():
            logger.error("Catalog database not found")
            return []
        
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            
            # Calculate distance in SQL and filter
            query = f"""
            SELECT 
                source_id,
                ra, dec,
                x, y, z,
                parallax,
                distance_pc,
                magnitude,
                bp_rp,
                pmra, pmdec,
                radial_velocity,
                temperature,
                SQRT(
                    (x - ?) * (x - ?) + 
                    (y - ?) * (y - ?) + 
                    (z - ?) * (z - ?)
                ) AS distance_from_camera
            FROM stars
            WHERE magnitude < ?
            HAVING distance_from_camera < ?
            ORDER BY distance_from_camera ASC, magnitude ASC
            LIMIT ?
            """
            
            cursor = conn.execute(
                query,
                (camera_x, camera_x, camera_y, camera_y, camera_z, camera_z,
                 mag_limit, max_distance, max_stars)
            )
            
            stars = []
            for row in cursor:
                # Convert bp_rp to RGB
                bp_rp = row['bp_rp'] if row['bp_rp'] is not None else 0.0
                rgb = self._bp_rp_to_rgb(bp_rp)
                
                star = {
                    'source_id': str(row['source_id']),
                    'ra': float(row['ra']),
                    'dec': float(row['dec']),
                    'x': float(row['x']),
                    'y': float(row['y']),
                    'z': float(row['z']),
                    'parallax': float(row['parallax']) if row['parallax'] else None,
                    'distance_pc': float(row['distance_pc']),
                    'magnitude': float(row['magnitude']),
                    'color_bp_rp': bp_rp,
                    'r': rgb[0],
                    'g': rgb[1],
                    'b': rgb[2],
                    'pm_ra': float(row['pmra']) if row['pmra'] else 0.0,
                    'pm_dec': float(row['pmdec']) if row['pmdec'] else 0.0,
                    'radial_velocity': float(row['radial_velocity']) if row['radial_velocity'] else None,
                    'temperature': float(row['temperature']) if row['temperature'] else None,
                }
                stars.append(star)
            
            conn.close()
            
            logger.info(f"Retrieved {len(stars)} stars from local catalog (camera distance < {max_distance:.1f} pc)")
            return stars
            
        except Exception as e:
            logger.error(f"Local catalog query failed: {e}")
            return []
    
    async def query_all_bright_stars_async(self, mag_limit: float = 6.5) -> List[Dict]:
        """Get all stars brighter than magnitude limit"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._query_all_bright_stars_sync,
            mag_limit
        )
    
    def _query_all_bright_stars_sync(self, mag_limit: float) -> List[Dict]:
        """Get all bright stars from catalog"""
        
        if not self.db_path.exists():
            logger.error("Catalog database not found")
            return []
        
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            
            query = """
            SELECT *
            FROM stars
            WHERE magnitude < ?
            ORDER BY magnitude ASC
            """
            
            cursor = conn.execute(query, (mag_limit,))
            
            stars = []
            for row in cursor:
                bp_rp = row['bp_rp'] if row['bp_rp'] is not None else 0.0
                rgb = self._bp_rp_to_rgb(bp_rp)
                
                star = {
                    'source_id': str(row['source_id']),
                    'ra': float(row['ra']),
                    'dec': float(row['dec']),
                    'x': float(row['x']),
                    'y': float(row['y']),
                    'z': float(row['z']),
                    'parallax': float(row['parallax']) if row['parallax'] else None,
                    'distance_pc': float(row['distance_pc']),
                    'magnitude': float(row['magnitude']),
                    'color_bp_rp': bp_rp,
                    'r': rgb[0],
                    'g': rgb[1],
                    'b': rgb[2],
                    'pm_ra': float(row['pmra']) if row['pmra'] else 0.0,
                    'pm_dec': float(row['pmdec']) if row['pmdec'] else 0.0,
                    'radial_velocity': float(row['radial_velocity']) if row['radial_velocity'] else None,
                    'temperature': float(row['temperature']) if row['temperature'] else None,
                }
                stars.append(star)
            
            conn.close()
            
            logger.success(f"Retrieved {len(stars)} bright stars (mag < {mag_limit})")
            return stars
            
        except Exception as e:
            logger.error(f"Bright stars query failed: {e}")
            return []
    
    def _bp_rp_to_rgb(self, bp_rp: float) -> tuple:
        """Convert BP-RP color to RGB (simple temperature-based mapping)"""
        # BP-RP ranges from ~-0.5 (blue/hot) to ~4.0 (red/cool)
        # Clamp and normalize
        bp_rp = max(-0.5, min(4.0, bp_rp))
        
        # Map to temperature-like colors
        if bp_rp < 0:  # Very blue (hot stars)
            return (0.6, 0.7, 1.0)
        elif bp_rp < 0.5:  # Blue-white
            return (0.8, 0.9, 1.0)
        elif bp_rp < 1.0:  # White
            return (1.0, 1.0, 1.0)
        elif bp_rp < 1.5:  # Yellow-white
            return (1.0, 0.95, 0.7)
        elif bp_rp < 2.5:  # Orange
            return (1.0, 0.8, 0.5)
        else:  # Red (cool stars)
            return (1.0, 0.6, 0.4)


# Global instance
local_catalog_service = LocalCatalogService()
