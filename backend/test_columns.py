"""Quick test to see what columns pandas produces"""
from astroquery.gaia import Gaia
import pandas as pd

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

print(f"Got {len(result_table)} rows")
print(f"Astropy columns: {result_table.colnames}")

# Convert to pandas
df = result_table.to_pandas()
print(f"\nPandas columns: {list(df.columns)}")
print(f"\nFirst row:\n{df.iloc[0]}")
