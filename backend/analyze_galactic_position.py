import sqlite3
import numpy as np

conn = sqlite3.connect('data/gaia_catalog.db')

# Get all stars with their galactic coordinates
cursor = conn.execute('''
    SELECT x, y, z, magnitude, ra, dec
    FROM stars
    ORDER BY magnitude ASC
    LIMIT 100
''')

stars = cursor.fetchall()

print("=" * 70)
print("MILKY WAY LOCATION ANALYSIS")
print("=" * 70)
print()

# Earth/Sun position in the Milky Way:
# - We are in the Orion Arm (Orion Spur)
# - About 26,000 light-years from galactic center
# - Located between Sagittarius and Perseus arms
# - Galactic coordinates: roughly in the galactic plane

print("🌍 Earth's Position in Milky Way:")
print("   - Location: Orion Arm (Orion Spur)")
print("   - Distance from galactic center: ~26,000 light-years")
print("   - Between Sagittarius Arm (inner) and Perseus Arm (outer)")
print()

# Analyze the distribution
x_coords = [s[0] for s in stars]
y_coords = [s[1] for s in stars]
z_coords = [s[2] for s in stars]

print("📊 Your Star Distribution (brightest 100 stars):")
print(f"   X range: {min(x_coords):.1f} to {max(x_coords):.1f} pc")
print(f"   Y range: {min(y_coords):.1f} to {max(y_coords):.1f} pc")
print(f"   Z range: {min(z_coords):.1f} to {max(z_coords):.1f} pc")
print()

# Get total catalog stats
cursor2 = conn.execute('SELECT COUNT(*) FROM stars')
total = cursor2.fetchone()[0]

# Stars by distance ranges
ranges = [
    (0, 100, "LOCAL BUBBLE (our immediate neighborhood)"),
    (100, 500, "NEARBY ORION ARM"),
    (500, 2000, "EXTENDED ORION ARM & NEARBY REGIONS"),
    (2000, 10000, "VISIBLE MILKY WAY DISK"),
]

print("🌌 Star Distribution by Galactic Region:")
print()

for min_d, max_d, region_name in ranges:
    cursor3 = conn.execute(f'''
        SELECT COUNT(*) 
        FROM stars 
        WHERE SQRT(x*x + y*y + z*z) >= {min_d} AND SQRT(x*x + y*y + z*z) < {max_d}
    ''')
    count = cursor3.fetchone()[0]
    percentage = (count / total) * 100
    print(f"   {region_name}")
    print(f"   Distance: {min_d}-{max_d} parsecs ({min_d*3.26:.0f}-{max_d*3.26:.0f} light-years)")
    print(f"   Stars: {count:,} ({percentage:.1f}%)")
    print()

# Check for Milky Way notable directions
print("🎯 Notable Milky Way Directions in Your Data:")
print()

# Galactic center direction (RA ~266°, Dec ~-29°)
cursor4 = conn.execute('''
    SELECT COUNT(*) FROM stars 
    WHERE ra BETWEEN 250 AND 280 AND dec BETWEEN -40 AND -20
''')
gc_stars = cursor4.fetchone()[0]
print(f"   Towards GALACTIC CENTER (Sagittarius): {gc_stars:,} stars")
print(f"   (RA 250-280°, Dec -40° to -20°)")
print()

# Galactic anticenter direction (RA ~84°, Dec ~28°)
cursor5 = conn.execute('''
    SELECT COUNT(*) FROM stars 
    WHERE ra BETWEEN 70 AND 100 AND dec BETWEEN 20 AND 40
''')
ac_stars = cursor5.fetchone()[0]
print(f"   Towards GALACTIC ANTICENTER (Auriga/Gemini): {ac_stars:,} stars")
print(f"   (RA 70-100°, Dec 20-40°)")
print()

# North galactic pole (RA ~192°, Dec ~27°)
cursor6 = conn.execute('''
    SELECT COUNT(*) FROM stars 
    WHERE ra BETWEEN 180 AND 210 AND dec BETWEEN 20 AND 35
''')
ngp_stars = cursor6.fetchone()[0]
print(f"   Towards NORTH GALACTIC POLE (Coma Berenices): {ngp_stars:,} stars")
print(f"   (RA 180-210°, Dec 20-35°) - Looking 'up' out of galaxy")
print()

# South galactic pole (RA ~5°, Dec ~-27°)
cursor7 = conn.execute('''
    SELECT COUNT(*) FROM stars 
    WHERE (ra BETWEEN 0 AND 20 OR ra BETWEEN 350 AND 360) AND dec BETWEEN -35 AND -20
''')
sgp_stars = cursor7.fetchone()[0]
print(f"   Towards SOUTH GALACTIC POLE (Sculptor): {sgp_stars:,} stars")
print(f"   (RA 0-20°/350-360°, Dec -35° to -20°) - Looking 'down' out of galaxy")
print()

print("=" * 70)
print("ANSWER: You're viewing stars in ALL DIRECTIONS around Earth!")
print("        This includes our LOCAL ORION ARM neighborhood")
print("        Most stars are within 500 parsecs (1,630 light-years)")
print("=" * 70)

conn.close()
