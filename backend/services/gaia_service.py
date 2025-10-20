"""
ESA Gaia DR3 Archive Service
Handles real-time queries to Gaia TAP+ service for astronomical data
"""
from typing import List, Dict, Optional, Tuple
from astroquery.gaia import Gaia
from astropy.coordinates import SkyCoord
from astropy import units as u
import numpy as np
import pandas as pd
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential
import asyncio
from functools import partial

from config import settings


class GaiaService:
    """Service for querying ESA Gaia Data Release 3"""
    
    def __init__(self):
        """Initialize Gaia service with TAP+ endpoint"""
        Gaia.MAIN_GAIA_TABLE = "gaiadr3.gaia_source"
        Gaia.ROW_LIMIT = settings.GAIA_MAX_ROWS
        logger.info(f"Gaia service initialized with TAP URL: {settings.GAIA_TAP_URL}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    async def query_cone_async(
        self,
        ra: float,
        dec: float,
        radius_deg: float,
        max_stars: int = 10000,
        min_magnitude: float = 20.0
    ) -> List[Dict]:
        """
        Query stars in a cone around specified coordinates (async wrapper)
        
        Args:
            ra: Right ascension in degrees (0-360)
            dec: Declination in degrees (-90 to 90)
            radius_deg: Search radius in degrees
            max_stars: Maximum number of stars to return
            min_magnitude: Faintest magnitude to include (lower = brighter)
        
        Returns:
            List of star dictionaries with positions, magnitudes, colors, etc.
        """
        logger.info(f"Querying Gaia: RA={ra:.2f}, DEC={dec:.2f}, radius={radius_deg:.4f}deg, limit={max_stars}")
        
        # Run blocking astroquery call in executor to avoid blocking async loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            partial(self._query_cone_sync, ra, dec, radius_deg, max_stars, min_magnitude)
        )
        
        return result
    
    def _query_cone_sync(
        self,
        ra: float,
        dec: float,
        radius_deg: float,
        max_stars: int,
        min_magnitude: float
    ) -> List[Dict]:
        """Synchronous cone query (runs in thread pool)"""
        
        # Build ADQL query for Gaia DR3
        query = f"""
        SELECT TOP {max_stars}
            source_id,
            ra, dec,
            parallax, parallax_error,
            pmra, pmdec,
            phot_g_mean_mag,
            phot_bp_mean_mag,
            phot_rp_mean_mag,
            bp_rp,
            radial_velocity,
            teff_gspphot AS temperature
        FROM gaiadr3.gaia_source
        WHERE 1=CONTAINS(
            POINT('ICRS', ra, dec),
            CIRCLE('ICRS', {ra}, {dec}, {radius_deg})
        )
        AND phot_g_mean_mag < {min_magnitude}
        ORDER BY phot_g_mean_mag ASC
        """
        
        try:
            # Execute query
            job = Gaia.launch_job_async(query, dump_to_file=False)
            result_table = job.get_results()
            
            # Convert astropy table to Python list of dicts
            # Using .to_pandas() for easier data access
            import pandas as pd
            df = result_table.to_pandas()
            # Normalize pandas columns to lowercase to avoid case-sensitivity issues
            df.columns = [str(c).lower() for c in df.columns]
            
            logger.info(f"Retrieved {len(df)} rows from Gaia DR3")
            
            stars = []
            for idx, row in df.iterrows():
                try:
                    # Safely extract values with proper null checking (using normalized lowercase columns)
                    parallax_val = row['parallax'] if 'parallax' in row.index and pd.notna(row['parallax']) else None
                    bp_rp_val = row['bp_rp'] if 'bp_rp' in row.index and pd.notna(row['bp_rp']) else None
                    
                    # Convert equatorial (RA/DEC) to Cartesian (X/Y/Z)
                    distance_pc = self._parallax_to_distance(parallax_val)
                    x, y, z = self._equatorial_to_cartesian(
                        float(row['ra']), float(row['dec']), distance_pc
                    )
                    
                    # Calculate color from B-V photometry
                    color_rgb = self._bp_rp_to_rgb(bp_rp_val if bp_rp_val is not None else 0.0)
                    
                    # Safely get proper motion values
                    pmra_val = row['pmra'] if 'pmra' in row.index and pd.notna(row['pmra']) else 0.0
                    pmdec_val = row['pmdec'] if 'pmdec' in row.index and pd.notna(row['pmdec']) else 0.0
                    rv_val = row['radial_velocity'] if 'radial_velocity' in row.index and pd.notna(row['radial_velocity']) else None
                    # Try temperature column (aliased in SQL)
                    temp_val = None
                    if 'temperature' in row.index and pd.notna(row['temperature']):
                        temp_val = row['temperature']
                    
                    star = {
                        'source_id': str(int(row['source_id'])) if 'source_id' in row.index and pd.notna(row['source_id']) else None,
                        'ra': float(row['ra']),
                        'dec': float(row['dec']),
                        'x': x,
                        'y': y,
                        'z': z,
                        'parallax': float(parallax_val) if parallax_val is not None else None,
                        'distance_pc': distance_pc,
                        'magnitude': float(row['phot_g_mean_mag']),
                        'color_bp_rp': float(bp_rp_val) if bp_rp_val is not None else None,
                        'r': color_rgb[0],
                        'g': color_rgb[1],
                        'b': color_rgb[2],
                        'pm_ra': float(pmra_val),
                        'pm_dec': float(pmdec_val),
                        'radial_velocity': float(rv_val) if rv_val is not None else None,
                        'temperature': float(temp_val) if temp_val is not None else None,
                    }
                    stars.append(star)
                except Exception as row_error:
                    # Skip problematic rows but log them with details
                    logger.warning(f"Skipping row {idx} due to error: {row_error}. Available columns: {list(row.index)[:10]}")
                    continue
            
            logger.success(f"Retrieved {len(stars)} stars from Gaia DR3")
            return stars
            
        except Exception as e:
            logger.error(f"Gaia query failed: {e}")
            raise
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    async def query_bright_stars_async(
        self,
        mag_limit: float = 6.5
    ) -> List[Dict]:
        """
        Query ALL bright stars across the entire sky (async wrapper)
        This returns the naked-eye visible star catalog - the foundation of planetarium view
        
        Args:
            mag_limit: Magnitude limit (6.5 = ~9000 naked-eye visible stars, 8.0 = ~50,000 stars)
        
        Returns:
            List of all bright stars with positions, magnitudes, colors
        """
        logger.info(f"Querying full-sky bright star catalog (mag < {mag_limit})...")
        
        # Run blocking query in executor
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            partial(self._query_bright_stars_sync, mag_limit)
        )
        
        return result
    
    def _query_bright_stars_sync(self, mag_limit: float) -> List[Dict]:
        """Synchronous full-sky bright star query"""
        
        # Query ALL bright stars - no spatial constraint
        query = f"""
        SELECT
            source_id,
            ra, dec,
            parallax, parallax_error,
            pmra, pmdec,
            phot_g_mean_mag,
            phot_bp_mean_mag,
            phot_rp_mean_mag,
            bp_rp,
            radial_velocity,
            teff_gspphot AS temperature
        FROM gaiadr3.gaia_source
        WHERE phot_g_mean_mag < {mag_limit}
        ORDER BY phot_g_mean_mag ASC
        """
        
        try:
            # Execute query
            logger.info(f"Executing full-sky query for mag < {mag_limit}...")
            job = Gaia.launch_job_async(query, dump_to_file=False)
            result_table = job.get_results()
            
            logger.info(f"Query finished. Retrieved {len(result_table)} rows from Gaia DR3")
            
            # Convert to pandas for easier handling
            df = result_table.to_pandas()
            
            # Normalize column names to lowercase
            df.columns = [str(c).lower() for c in df.columns]
            
            stars = []
            for idx, row in df.iterrows():
                try:
                    # Extract fields safely
                    source_id = str(row['source_id']) if 'source_id' in row.index else None
                    ra = float(row['ra']) if 'ra' in row.index else None
                    dec = float(row['dec']) if 'dec' in row.index else None
                    
                    if ra is None or dec is None:
                        continue
                    
                    # Parallax and distance
                    parallax_val = row.get('parallax')
                    parallax_val = float(parallax_val) if pd.notna(parallax_val) else None
                    
                    if parallax_val and parallax_val > 0:
                        distance_pc = self._parallax_to_distance(parallax_val)
                    else:
                        # Use magnitude-based distance estimate
                        mag = float(row['phot_g_mean_mag'])
                        distance_pc = 10 ** ((mag - 5) / 5 + 1)  # Rough estimate
                    
                    # Convert RA/Dec to Cartesian (for 3D positioning)
                    x, y, z = self._equatorial_to_cartesian(ra, dec, distance_pc)
                    
                    # Colors and magnitude
                    bp_rp_val = row.get('bp_rp')
                    bp_rp_val = float(bp_rp_val) if pd.notna(bp_rp_val) else 0.0
                    color_rgb = self._bp_rp_to_rgb(bp_rp_val)
                    
                    # Proper motion
                    pmra_val = row.get('pmra', 0.0)
                    pmra_val = float(pmra_val) if pd.notna(pmra_val) else 0.0
                    pmdec_val = row.get('pmdec', 0.0)
                    pmdec_val = float(pmdec_val) if pd.notna(pmdec_val) else 0.0
                    
                    # Radial velocity and temperature
                    rv_val = row.get('radial_velocity')
                    rv_val = float(rv_val) if pd.notna(rv_val) else None
                    temp_val = row.get('temperature')
                    temp_val = float(temp_val) if pd.notna(temp_val) else None
                    
                    star = {
                        'source_id': source_id,
                        'ra': ra,
                        'dec': dec,
                        'x': x,
                        'y': y,
                        'z': z,
                        'parallax': parallax_val,
                        'distance_pc': distance_pc,
                        'magnitude': float(row['phot_g_mean_mag']),
                        'color_bp_rp': bp_rp_val,
                        'r': color_rgb[0],
                        'g': color_rgb[1],
                        'b': color_rgb[2],
                        'pm_ra': pmra_val,
                        'pm_dec': pmdec_val,
                        'radial_velocity': rv_val,
                        'temperature': temp_val,
                    }
                    stars.append(star)
                    
                except Exception as row_error:
                    logger.warning(f"Skipping row {idx}: {row_error}")
                    continue
            
            logger.success(f"Retrieved {len(stars)} bright stars from full sky")
            return stars
            
        except Exception as e:
            logger.error(f"Bright star catalog query failed: {e}")
            raise
    
    async def query_frustum_async(
        self,
        camera_position: Tuple[float, float, float],
        camera_direction: Tuple[float, float, float],
        fov_deg: float,
        max_distance: float = 1000.0,
        max_stars: int = 50000
    ) -> List[Dict]:
        """
        Query stars visible in camera frustum (what the user is looking at)
        
        Args:
            camera_position: (x, y, z) camera position in parsecs
            camera_direction: (dx, dy, dz) normalized view direction
            fov_deg: Field of view in degrees
            max_distance: Maximum distance to query in parsecs
            max_stars: Maximum stars to return
        
        Returns:
            List of visible stars
        """
        # Convert camera direction to RA/DEC
        ra, dec = self._cartesian_to_equatorial(
            camera_direction[0],
            camera_direction[1],
            camera_direction[2]
        )
        
        # Query cone around view direction
        # Radius = FOV + some margin for rotation
        radius_deg = fov_deg * 0.75  # Cone radius
        
        # Adjust magnitude limit based on distance (closer = see fainter stars)
        mag_limit = min(20.0, 15.0 + np.log10(max_distance / 100.0))
        
        return await self.query_cone_async(
            ra, dec, radius_deg, max_stars, mag_limit
        )
    
    @staticmethod
    def _parallax_to_distance(parallax_mas: Optional[float]) -> float:
        """Convert parallax (milliarcseconds) to distance (parsecs)"""
        if parallax_mas is None or parallax_mas <= 0:
            return 1000.0  # Default far distance for stars without parallax
        
        # Distance (pc) = 1000 / parallax (mas)
        distance = 1000.0 / parallax_mas
        
        # Clamp to reasonable range
        return max(0.1, min(distance, 100000.0))
    
    @staticmethod
    def _equatorial_to_cartesian(
        ra_deg: float,
        dec_deg: float,
        distance_pc: float
    ) -> Tuple[float, float, float]:
        """
        Convert equatorial coordinates (RA/DEC) to Cartesian (X/Y/Z)
        
        Uses right-handed coordinate system:
        - X points to RA=0, DEC=0 (vernal equinox)
        - Y points to RA=90, DEC=0
        - Z points to DEC=90 (north celestial pole)
        """
        ra_rad = np.radians(ra_deg)
        dec_rad = np.radians(dec_deg)
        
        x = distance_pc * np.cos(dec_rad) * np.cos(ra_rad)
        y = distance_pc * np.cos(dec_rad) * np.sin(ra_rad)
        z = distance_pc * np.sin(dec_rad)
        
        return (float(x), float(y), float(z))
    
    @staticmethod
    def _cartesian_to_equatorial(x: float, y: float, z: float) -> Tuple[float, float]:
        """Convert Cartesian to equatorial coordinates (RA/DEC in degrees)"""
        distance = np.sqrt(x**2 + y**2 + z**2)
        if distance == 0:
            return (0.0, 0.0)
        
        ra_rad = np.arctan2(y, x)
        dec_rad = np.arcsin(z / distance)
        
        ra_deg = np.degrees(ra_rad)
        if ra_deg < 0:
            ra_deg += 360.0
        
        dec_deg = np.degrees(dec_rad)
        
        return (float(ra_deg), float(dec_deg))
    
    @staticmethod
    def _bp_rp_to_rgb(bp_rp: float) -> Tuple[float, float, float]:
        """
        Convert Gaia BP-RP color index to RGB color
        
        BP-RP ranges from ~-0.5 (hot blue stars) to ~4.0 (cool red stars)
        Reference: https://www.cosmos.esa.int/web/gaia/dr3-extinction
        """
        # Normalize BP-RP to 0-1 range
        # Typical range: -0.5 (blue) to 4.0 (red)
        normalized = (bp_rp + 0.5) / 4.5
        normalized = max(0.0, min(1.0, normalized))
        
        # Color temperature mapping
        if normalized < 0.2:
            # Hot blue stars (O, B type)
            r = 0.6 + normalized * 2.0
            g = 0.7 + normalized * 1.5
            b = 1.0
        elif normalized < 0.5:
            # White stars (A, F type)
            r = 1.0
            g = 1.0
            b = 1.0 - (normalized - 0.2) * 2.0
        elif normalized < 0.7:
            # Yellow stars (G, K type)
            r = 1.0
            g = 1.0 - (normalized - 0.5) * 1.5
            b = 0.4
        else:
            # Red stars (M type)
            r = 1.0
            g = 0.6 - (normalized - 0.7) * 1.0
            b = 0.3
        
        return (float(r), float(g), float(b))


# Global service instance
gaia_service = GaiaService()
