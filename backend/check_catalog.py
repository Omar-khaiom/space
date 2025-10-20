import sqlite3

conn = sqlite3.connect('data/gaia_catalog.db')

# Get coverage stats
cursor = conn.execute('''
    SELECT COUNT(*) as cnt, 
           MIN(ra) as min_ra, MAX(ra) as max_ra,
           MIN(dec) as min_dec, MAX(dec) as max_dec,
           MIN(magnitude) as min_mag, MAX(magnitude) as max_mag
    FROM stars
''')
row = cursor.fetchone()
print(f'Total stars: {row[0]}')
print(f'RA range: {row[1]:.2f}° to {row[2]:.2f}°')
print(f'Dec range: {row[3]:.2f}° to {row[4]:.2f}°')
print(f'Magnitude: {row[5]:.2f} to {row[6]:.2f}')
print()

# Get brightest stars
cursor2 = conn.execute('SELECT ra, dec, magnitude, source_id FROM stars ORDER BY magnitude ASC LIMIT 15')
print('Brightest 15 stars in catalog:')
for r in cursor2:
    print(f'  RA={r[0]:7.2f}° Dec={r[1]:7.2f}° Mag={r[2]:5.2f} (Gaia DR3 {r[3]})')

conn.close()
