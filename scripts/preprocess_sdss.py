#!/usr/bin/env python3
"""
SDSS Data Preprocessor for Cosmic-Web Visualization
Converts RA/Dec/z coordinates to 3D Cartesian using proper cosmology
"""

import pandas as pd
import numpy as np
import argparse
import os
import sys
from pathlib import Path

def setup_cosmology():
    """Setup proper cosmological distance calculations"""
    try:
        from astropy.cosmology import Planck18
        from astropy import units as u
        return Planck18
    except ImportError:
        print("⚠️  astropy not found - using simplified distance calculation")
        print("💡 For proper cosmology: pip install astropy")
        return None

def load_data(input_file):
    """Load SDSS data with fallback to sample data"""
    print(f"📂 Loading data from {input_file}...")
    
    if not os.path.exists(input_file):
        print(f"❌ Input file not found: {input_file}")
        
        # Try sample data as fallback
        sample_path = Path(__file__).parent / "sample_data.csv"
        if sample_path.exists():
            print(f"💡 Using sample data: {sample_path}")
            input_file = str(sample_path)
        else:
            print("❌ No sample data found either")
            sys.exit(1)
    
    # Read data, handling comments
    data = pd.read_csv(input_file, comment='#')
    
    # Validate required columns
    required_cols = ['ra', 'dec', 'z', 'modelMag_r']
    missing_cols = [col for col in required_cols if col not in data.columns]
    
    if missing_cols:
        print(f"❌ Missing required columns: {missing_cols}")
        print(f"📋 Available columns: {list(data.columns)}")
        sys.exit(1)
    
    # Clean data
    data = data.dropna(subset=required_cols)
    data = data[data['z'] > 0]  # Remove invalid redshifts
    
    print(f"✅ Loaded {len(data):,} valid galaxies")
    return data

def convert_to_3d(data, cosmology=None):
    """Convert RA/Dec/z to 3D Cartesian coordinates"""
    print("🌐 Converting to 3D coordinates...")
    
    # Convert to radians
    ra_rad = np.radians(data['ra'])
    dec_rad = np.radians(data['dec'])
    
    if cosmology:
        # Proper cosmological distances
        print("🔬 Using Planck18 cosmology")
        from astropy import units as u
        
        distances = cosmology.comoving_distance(data['z']).to(u.Mpc).value
    else:
        # Simplified distance for testing (not scientifically accurate)
        print("⚠️  Using simplified distance calculation")
        c_km_s = 299792.458  # km/s
        H0 = 70  # km/s/Mpc (approximate)
        distances = (c_km_s * data['z']) / H0  # Rough Hubble distance in Mpc
    
    # Convert to Cartesian (standard astronomical convention)
    x = distances * np.cos(dec_rad) * np.cos(ra_rad)
    y = distances * np.cos(dec_rad) * np.sin(ra_rad)
    z = distances * np.sin(dec_rad)
    
    # Add to dataframe
    data = data.copy()
    data['x'] = x
    data['y'] = y
    data['z_coord'] = z  # Rename to avoid confusion with redshift 'z'
    
    print(f"📊 3D coordinate ranges (Mpc):")
    print(f"   X: {x.min():.1f} to {x.max():.1f}")
    print(f"   Y: {y.min():.1f} to {y.max():.1f}")
    print(f"   Z: {z.min():.1f} to {z.max():.1f}")
    
    return data

def calculate_properties(data):
    """Calculate size, color, and other properties"""
    print("🎨 Calculating galaxy properties...")
    
    # Size based on magnitude (brighter = larger)
    # Convert magnitude to linear scale, then to size
    mag_min, mag_max = data['modelMag_r'].min(), data['modelMag_r'].max()
    mag_norm = (data['modelMag_r'] - mag_min) / (mag_max - mag_min)
    
    # Invert so brighter (lower mag) = larger size
    size = 2.0 + (1.0 - mag_norm) * 3.0  # Size range: 2-5
    
    # Color based on redshift (blue→red with distance)
    z_min, z_max = data['z'].min(), data['z'].max()
    z_norm = (data['z'] - z_min) / (z_max - z_min) if z_max > z_min else np.zeros_like(data['z'])
    
    # Blue at low z, red at high z
    color_r = 0.3 + z_norm * 0.7      # 0.3 → 1.0
    color_g = 0.5 + z_norm * 0.3      # 0.5 → 0.8  
    color_b = 1.0 - z_norm * 0.7      # 1.0 → 0.3
    
    # Add brightness variation based on magnitude
    brightness = 1.2 - mag_norm * 0.5  # Brighter galaxies get more intense colors
    color_r *= brightness
    color_g *= brightness
    color_b *= brightness
    
    # Clamp colors to valid range
    data = data.copy()
    data['size'] = size
    data['color_r'] = np.clip(color_r, 0.0, 1.0)
    data['color_g'] = np.clip(color_g, 0.0, 1.0)
    data['color_b'] = np.clip(color_b, 0.0, 1.0)
    data['mag'] = data['modelMag_r']  # Keep for reference
    
    return data

def save_processed_data(data, output_file):
    """Save processed data for visualization"""
    print(f"💾 Saving processed data to {output_file}...")
    
    # Select columns for visualization
    viz_columns = ['x', 'y', 'z_coord', 'size', 'color_r', 'color_g', 'color_b', 'z', 'mag']
    viz_data = data[viz_columns].copy()
    
    # Round to reasonable precision
    viz_data = viz_data.round({
        'x': 2, 'y': 2, 'z_coord': 2,
        'size': 2, 'color_r': 3, 'color_g': 3, 'color_b': 3,
        'z': 4, 'mag': 2
    })
    
    # Create output directory if needed
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Write with header
    header = [
        "# Processed galaxy data for cosmic-web visualization",
        "# Columns: x,y,z_coord (Mpc), size, color_r,g,b (0-1), z (redshift), mag (r-band)",
        "# Coordinate system: standard astronomical (x=RA*cos(dec), y=RA*sin(dec), z=dec*dist)"
    ]
    
    with open(output_file, 'w') as f:
        f.write('\n'.join(header) + '\n')
    
    viz_data.to_csv(output_file, mode='a', index=False)
    
    print(f"✅ Saved {len(viz_data):,} processed galaxies")
    return viz_data

def main():
    parser = argparse.ArgumentParser(description='Process SDSS data for cosmic-web visualization')
    parser.add_argument('--input', required=True, help='Input CSV file (SDSS format)')
    parser.add_argument('--output', required=True, help='Output CSV file (processed)')
    
    args = parser.parse_args()
    
    print("🌌 SDSS Cosmic-Web Data Preprocessor")
    print("=" * 50)
    
    # Setup cosmology
    cosmology = setup_cosmology()
    
    # Process data
    data = load_data(args.input)
    data = convert_to_3d(data, cosmology)
    data = calculate_properties(data)
    processed_data = save_processed_data(data, args.output)
    
    print("\n🎉 Processing complete!")
    print(f"📁 Input:  {args.input}")
    print(f"📁 Output: {args.output}")
    print(f"🌟 Ready for tiling and visualization!")
    
    # Quick stats
    print(f"\n📊 Dataset Summary:")
    print(f"   Galaxies: {len(processed_data):,}")
    print(f"   Redshift range: {processed_data['z'].min():.3f} - {processed_data['z'].max():.3f}")
    print(f"   Magnitude range: {processed_data['mag'].min():.1f} - {processed_data['mag'].max():.1f}")
    print(f"   Spatial extent: {np.sqrt(processed_data['x']**2 + processed_data['y']**2 + processed_data['z_coord']**2).max():.1f} Mpc")

if __name__ == "__main__":
    main()