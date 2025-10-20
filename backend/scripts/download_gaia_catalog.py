"""
Download Gaia DR3 catalog subset and create local SQLite database
This downloads bright stars directly from ESA Gaia archive
"""
import sqlite3
import pandas as pd
from astroquery.gaia import Gaia
from loguru import logger
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def download_bright_catalog(mag_limit=8.0, max_distance_pc=None, output_db="data/gaia_catalog.db"):
    """
    Download bright stars from Gaia DR3 and save to SQLite
    
    Args:
        mag_limit: Maximum magnitude (8.0 = ~400K stars, 6.5 = ~9K stars)
        max_distance_pc: Maximum distance in parsecs (None = no limit)
        output_db: Output database path
    """
    logger.info(f"Downloading Gaia DR3 stars with mag < {mag_limit}...")
    if max_distance_pc:
        logger.info(f"Limiting to distance < {max_distance_pc} parsecs")
    
    # Build WHERE clause
    where_clauses = [
        f"phot_g_mean_mag < {mag_limit}",
        "parallax IS NOT NULL"
    ]
    
    if max_distance_pc:
        # parallax in mas, distance in pc: dist = 1000/parallax
        # So parallax > 1000/max_distance_pc
        min_parallax = 1000.0 / max_distance_pc
        where_clauses.append(f"parallax > {min_parallax}")
    
    where_clause = " AND ".join(where_clauses)
    
    # Query to get bright stars with all needed fields
    query = f"""
    SELECT 
        source_id,
        ra, dec,
        parallax, parallax_error,
        pmra, pmdec,
        phot_g_mean_mag AS magnitude,
        phot_bp_mean_mag,
        phot_rp_mean_mag,
        bp_rp,
        radial_velocity,
        teff_gspphot AS temperature
    FROM gaiadr3.gaia_source
    WHERE {where_clause}
    ORDER BY phot_g_mean_mag ASC
    """
    
    try:
        # Execute query
        logger.info("Submitting query to Gaia TAP...")
        job = Gaia.launch_job_async(query, dump_to_file=False)
        result_table = job.get_results()
        
        logger.success(f"Downloaded {len(result_table)} stars from Gaia DR3")
        
        # Convert to pandas
        df = result_table.to_pandas()
        
        # Normalize column names to lowercase
        df.columns = [c.lower() for c in df.columns]
        
        # Calculate distance (parsecs) from parallax
        df['distance_pc'] = 1000.0 / df['parallax'].clip(lower=0.001)  # Avoid division by zero
        
        # Calculate Cartesian coordinates (for 3D positioning)
        import numpy as np
        ra_rad = np.radians(df['ra'])
        dec_rad = np.radians(df['dec'])
        
        df['x'] = df['distance_pc'] * np.cos(dec_rad) * np.cos(ra_rad)
        df['y'] = df['distance_pc'] * np.sin(dec_rad)
        df['z'] = df['distance_pc'] * np.cos(dec_rad) * np.sin(ra_rad)
        
        # Fill NaN values
        df['bp_rp'] = df['bp_rp'].fillna(0.0)
        df['pmra'] = df['pmra'].fillna(0.0)
        df['pmdec'] = df['pmdec'].fillna(0.0)
        df['radial_velocity'] = df['radial_velocity'].fillna(0.0)
        df['temperature'] = df['temperature'].fillna(5778.0)  # Sun-like default
        
        # Create output directory
        output_path = Path(output_db)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save to SQLite
        logger.info(f"Saving to SQLite: {output_db}")
        conn = sqlite3.connect(output_db)
        
        # Save dataframe
        df.to_sql('stars', conn, if_exists='replace', index=False)
        
        # Create indices for fast queries
        logger.info("Creating indices...")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_magnitude ON stars(magnitude)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ra_dec ON stars(ra, dec)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_xyz ON stars(x, y, z)")
        
        conn.commit()
        conn.close()
        
        logger.success(f"✅ Catalog saved: {len(df)} stars in {output_db}")
        logger.info(f"   Magnitude range: {df['magnitude'].min():.2f} to {df['magnitude'].max():.2f}")
        logger.info(f"   Distance range: {df['distance_pc'].min():.1f} to {df['distance_pc'].max():.1f} pc")
        
        return output_db
        
    except Exception as e:
        logger.error(f"Download failed: {e}")
        raise


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Download Gaia DR3 catalog")
    parser.add_argument("--mag-limit", type=float, default=8.0, 
                       help="Magnitude limit (default: 8.0 = ~400K stars)")
    parser.add_argument("--max-distance", type=float, default=None,
                       help="Maximum distance in parsecs (default: None = no limit)")
    parser.add_argument("--output", type=str, default="data/gaia_catalog.db",
                       help="Output database file")
    
    args = parser.parse_args()
    
    download_bright_catalog(
        mag_limit=args.mag_limit,
        max_distance_pc=args.max_distance,
        output_db=args.output
    )
