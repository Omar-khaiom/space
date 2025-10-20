import sqlite3

conn = sqlite3.connect('data/gaia_catalog.db')

print("=" * 70)
print("COLOR DISTRIBUTION ANALYSIS")
print("=" * 70)
print()

# Get bright stars (most visible)
cursor = conn.execute('''
    SELECT magnitude, bp_rp, COUNT(*) as cnt
    FROM stars
    WHERE magnitude < 4.0
    GROUP BY ROUND(magnitude, 1), ROUND(bp_rp, 1)
    ORDER BY magnitude
    LIMIT 50
''')

print("🌟 BRIGHT STARS (magnitude < 4.0) - What you see most:")
print()
for row in cursor:
    mag, bp_rp, cnt = row
    if bp_rp is None:
        color_desc = "WHITE (no data)"
    elif bp_rp < 0.5:
        color_desc = "BLUE/BLUE-WHITE"
    elif bp_rp < 1.2:
        color_desc = "WHITE/YELLOW"
    elif bp_rp < 2.5:
        color_desc = "ORANGE/RED"
    else:
        color_desc = "DEEP RED"
    
    print(f"  Mag {mag:.1f}, BP-RP {bp_rp if bp_rp else 'None':.2f}: {cnt:3d} stars - {color_desc}")

print()
print("=" * 70)
print("WHY SO MANY WHITE STARS?")
print("=" * 70)
print()

# Count by brightness and color
cursor2 = conn.execute('''
    SELECT 
        CASE 
            WHEN magnitude < 3 THEN 'Very Bright (<3)'
            WHEN magnitude < 5 THEN 'Bright (3-5)'
            WHEN magnitude < 7 THEN 'Medium (5-7)'
            ELSE 'Faint (7+)'
        END as brightness,
        CASE
            WHEN bp_rp < 0.5 THEN 'Blue/Blue-white'
            WHEN bp_rp < 1.2 THEN 'White/Yellow'
            WHEN bp_rp < 2.5 THEN 'Orange/Red'
            ELSE 'Deep Red'
        END as color_range,
        COUNT(*) as cnt
    FROM stars
    WHERE bp_rp IS NOT NULL
    GROUP BY brightness, color_range
    ORDER BY brightness, color_range
''')

print("Distribution by brightness and color:")
print()
current_brightness = None
for row in cursor2:
    brightness, color_range, cnt = row
    if brightness != current_brightness:
        if current_brightness is not None:
            print()
        print(f"📊 {brightness}:")
        current_brightness = brightness
    print(f"     {color_range}: {cnt:5d} stars")

print()
print("=" * 70)
print("ANSWER:")
print("=" * 70)
print()
print("Most BRIGHT stars (which dominate visual appearance) are:")
print("  • Blue/white hot stars (A, F types)")
print("  • These are INTRINSICALLY BRIGHT - that's why we see them!")
print()
print("Red stars are:")
print("  • Mostly FAINT red dwarfs (hard to see)")
print("  • Or DISTANT red giants")
print("  • Need to be HUGE to be bright (rare)")
print()
print("This is REALISTIC! Real night sky has mostly white/blue bright stars.")
print("Famous red stars (Betelgeuse, Antares) are rare exceptions!")

conn.close()
