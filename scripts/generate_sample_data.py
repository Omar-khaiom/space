#!/usr/bin/env python3
"""
Generate realistic sample galaxy data for testing
This creates a synthetic galaxy catalog similar to SDSS data
"""

import pandas as pd
import numpy as np
import random

def generate_sample_galaxies(num_galaxies=10000):
    """Generate realistic sample galaxy data"""
    print(f"Generating {num_galaxies:,} sample galaxies...")
    
    # Set random seed for reproducible results
    np.random.seed(42)
    random.seed(42)
    
    galaxies = []
    galaxy_types = ['spiral', 'elliptical', 'irregular', 'dwarf']
    type_probabilities = [0.45, 0.35, 0.15, 0.05]  # Realistic distribution
    
    # Define survey area (simplified - small patch of sky)
    ra_center = 180.0  # Right Ascension center (degrees)
    dec_center = 2.0   # Declination center (degrees)
    survey_size = 5.0  # 5 degree x 5 degree survey area
    
    for i in range(num_galaxies):
        # Random position within survey area
        ra = ra_center + np.random.uniform(-survey_size/2, survey_size/2)
        dec = dec_center + np.random.uniform(-survey_size/2, survey_size/2)
        
        # Galaxy type (weighted random choice)
        galaxy_type = np.random.choice(galaxy_types, p=type_probabilities)
        
        # Realistic magnitude distribution (brighter = lower numbers)
        # Apparent magnitude depends on intrinsic brightness + distance
        if galaxy_type == 'spiral':
            base_g = np.random.normal(18.0, 1.5)  # Spiral galaxies
        elif galaxy_type == 'elliptical': 
            base_g = np.random.normal(17.5, 1.2)  # Ellipticals (often brighter)
        elif galaxy_type == 'irregular':
            base_g = np.random.normal(19.0, 1.8)  # Irregulars (dimmer)
        else:  # dwarf
            base_g = np.random.normal(20.5, 1.0)  # Dwarf galaxies (very dim)
        
        # Ensure reasonable magnitude range (14-22)
        g_mag = np.clip(base_g, 14.0, 22.0)
        
        # Color relationships (g-r, r-i colors)
        # Different galaxy types have different colors
        if galaxy_type == 'spiral':
            g_r_color = np.random.normal(0.6, 0.2)  # Bluer
            r_i_color = np.random.normal(0.3, 0.15)
        elif galaxy_type == 'elliptical':
            g_r_color = np.random.normal(0.9, 0.2)  # Redder
            r_i_color = np.random.normal(0.4, 0.15)
        else:  # irregular, dwarf
            g_r_color = np.random.normal(0.5, 0.3)
            r_i_color = np.random.normal(0.25, 0.2)
        
        r_mag = g_mag - g_r_color
        i_mag = r_mag - r_i_color
        
        # Redshift (distance) - brighter galaxies tend to be closer
        # This is a simplification - real relationship is more complex
        base_redshift = (g_mag - 16.0) * 0.01  # Rough magnitude-redshift relation
        redshift = max(0.001, np.random.normal(base_redshift, 0.02))
        redshift = min(redshift, 0.3)  # Cap at reasonable redshift
        
        # Store galaxy data
        galaxy = {
            'ra': round(ra, 6),
            'dec': round(dec, 6), 
            'g_mag': round(g_mag, 2),
            'r_mag': round(r_mag, 2),
            'i_mag': round(i_mag, 2),
            'redshift': round(redshift, 4),
            'galaxy_type': galaxy_type
        }
        galaxies.append(galaxy)
        
        # Progress indicator
        if (i + 1) % 1000 == 0:
            print(f"Generated {i+1:,} galaxies...")
    
    return pd.DataFrame(galaxies)

def save_galaxy_data(df, output_file):
    """Save galaxy data to CSV file"""
    # Add header comments
    header = [
        "# Sample galaxy data (mimicking SDSS format)",
        "# Generated for galaxy visualization testing", 
        "# Columns: ra (degrees), dec (degrees), g_mag, r_mag, i_mag, redshift, galaxy_type",
        "# Data is synthetic but follows realistic distributions"
    ]
    
    with open(output_file, 'w') as f:
        f.write('\n'.join(header) + '\n')
    
    # Append the data
    df.to_csv(output_file, mode='a', index=False)
    print(f"Saved {len(df):,} galaxies to {output_file}")

def main():
    """Generate and save sample galaxy data"""
    print("🌌 Generating Sample Galaxy Data")
    print("=" * 40)
    
    # Generate sample data
    galaxy_df = generate_sample_galaxies(num_galaxies=25000)
    
    # Show some statistics
    print("\n📊 Dataset Statistics:")
    print(f"Total galaxies: {len(galaxy_df):,}")
    print(f"Sky area: ~25 square degrees")
    print(f"Magnitude range: {galaxy_df['g_mag'].min():.1f} - {galaxy_df['g_mag'].max():.1f}")
    print(f"Redshift range: {galaxy_df['redshift'].min():.3f} - {galaxy_df['redshift'].max():.3f}")
    print("\nGalaxy type distribution:")
    print(galaxy_df['galaxy_type'].value_counts())
    
    # Save to file
    output_file = "../data/galaxies_raw.csv"
    save_galaxy_data(galaxy_df, output_file)
    
    print(f"\n✅ Sample galaxy data created!")
    print(f"📁 File: {output_file}")
    print("🚀 Ready for processing with preprocess_sdss.py")

if __name__ == "__main__":
    main()