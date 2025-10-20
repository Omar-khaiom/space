"""
Test script to understand astropy Table row access patterns and find the bug
"""
from astroquery.gaia import Gaia
import numpy as np

# Simple test query - get just 5 stars
query = """
SELECT TOP 5
    source_id,
    ra, dec,
    parallax,
    pmra, pmdec,
    phot_g_mean_mag,
    bp_rp
FROM gaiadr3.gaia_source
WHERE phot_g_mean_mag < 10
ORDER BY phot_g_mean_mag ASC
"""

print("Executing Gaia query...")
job = Gaia.launch_job_async(query, dump_to_file=False)
result_table = job.get_results()

print(f"\n✓ Got {len(result_table)} rows")
print(f"✓ Column names: {result_table.colnames}")
print(f"✓ Table type: {type(result_table)}")

# Test different access methods
print("\n" + "="*60)
print("TESTING ROW ACCESS METHODS")
print("="*60)

for i, row in enumerate(result_table):
    if i == 0:  # Only test first row
        print(f"\n1. Row type: {type(row)}")
        print(f"2. Row repr: {row}")
        
        # Try dictionary-style access
        print("\n3. Testing dictionary access row['source_id']:")
        try:
            val = row['source_id']
            print(f"   ✓ SUCCESS: {val} (type: {type(val)})")
        except Exception as e:
            print(f"   ✗ FAILED: {e}")
        
        # Try attribute access
        print("\n4. Testing attribute access row.source_id:")
        try:
            val = row.source_id
            print(f"   ✓ SUCCESS: {val} (type: {type(val)})")
        except Exception as e:
            print(f"   ✗ FAILED: {e}")
        
        # Test masked value checking
        print("\n5. Testing masked value handling:")
        try:
            parallax_val = row['parallax']
            print(f"   - parallax raw: {parallax_val} (type: {type(parallax_val)})")
            print(f"   - is masked? {np.ma.is_masked(parallax_val)}")
        except Exception as e:
            print(f"   ✗ FAILED: {e}")

print("\n" + "="*60)
print("TESTING PANDAS APPROACH")
print("="*60)

# Show the pandas solution
print("\nUsing pandas DataFrame:")
import pandas as pd
df = result_table.to_pandas()

print(f"\nDataFrame columns: {df.columns.tolist()}")

for idx, row in df.iterrows():
    if idx == 0:
        print(f"\n✓ Row {idx}:")
        print(f"  - SOURCE_ID: {int(row['SOURCE_ID'])}")
        print(f"  - ra: {float(row['ra'])}")
        print(f"  - dec: {float(row['dec'])}")
        print(f"  - parallax: {row['parallax'] if pd.notna(row['parallax']) else None}")
        print(f"  - bp_rp: {row['bp_rp'] if pd.notna(row['bp_rp']) else None}")
        print(f"\n✓ All fields accessible with UPPERCASE column names!")
        break

print("\n✓ Test complete!")
