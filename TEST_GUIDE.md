# 🧪 Quick Test Guide - Live Gaia Integration

## Test the Live Connection Right Now!

### 1. Check Both Servers Are Running

**Backend API:**

```powershell
# Should see: "INFO: Application startup complete"
# Terminal showing uvicorn running on port 5000
```

**Frontend:**

```powershell
# Should see: "Serving HTTP on..."
# Terminal showing server on port 8000
```

### 2. Open Browser Console

1. Go to http://localhost:8000/viewer/
2. Press **F12** to open Developer Tools
3. Click **Console** tab
4. Look for these messages:

```
🌌 Starting Cosmic Web Viewer with Live Gaia DR3...
✅ Cosmic Web Viewer ready with live data!
🌍 Querying Gaia DR3: RA=45.00°, Dec=33.69°, radius=15°
✅ Loaded 5000 stars from Gaia DR3 (1456ms, cached: false)
```

### 3. Watch Data Stream

As you move around with WASD, you should see:

```
📡 Camera moved 1234 units - loading new region...
🌍 Querying Gaia DR3: RA=120.45°, Dec=-12.34°, radius=15°
✅ Loaded 4892 stars from Gaia DR3 (23ms, cached: true)  ← Much faster!
```

### 4. Verify Real Data

Look at the **status text** in top-left corner:

- Should say: "Viewing XXXX stars from Gaia DR3"
- Star count changes as you move
- Updates every time you travel far enough

### 5. Check Star Colors

Stars should have **realistic colors**:

- 🔵 Blue stars (hot, 30,000K)
- ⚪ White stars (Sun-like, 5,800K)
- 🟡 Yellow stars (cooler, 4,500K)
- 🔴 Red stars (cool, 3,000K)

**Old CSV version:** Limited color variety  
**New Live version:** Real colors from spectroscopy

---

## 🎮 Movement Test

### Test Dynamic Loading:

1. Note your current position in console
2. Hold **W** and fly forward for ~10 seconds
3. Should see: "📡 Camera moved..." message
4. New stars load automatically
5. Status updates with new count

### Exploration Ideas:

```
Start Position: (500, 400, 500)
   ↓ Fly with W key
Position: (1500, 400, 500)  ← Moved 1000 units
   ↓ Triggers new query
New stars appear!
```

---

## 🔍 Visual Comparison

### Old CSV Version:

- All stars same white/blue tint
- Same 97k stars everywhere
- No depth variation
- Static, never changes

### New Live Version:

- Stars colored by temperature
- Different stars in each region
- Real distances from parallax
- Updates as you explore

---

## 🐛 What If Something's Wrong?

### No Console Messages?

- Check browser console is open (F12)
- Refresh page (Ctrl+R)
- Check for errors in red

### "Failed to load live data"?

- Backend might not be running
- Check: http://localhost:5000/api/health
- Should return JSON with "status": "healthy"

### Stars Look Same as Before?

- Might be using fallback CSV
- Check console for "CSV fallback" message
- Backend API needs to be running

### Backend Not Responding?

```powershell
# Restart backend:
cd d:\space\backend
$env:PYTHONPATH='d:\space\backend'
python -m uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

---

## ✅ Success Checklist

- [ ] Console shows "Live Gaia DR3" in startup
- [ ] See RA/Dec coordinates in queries
- [ ] Star count changes as you move
- [ ] Query time shown (ms)
- [ ] "cached: true" on repeated queries
- [ ] Stars have varied colors (blue, white, red)
- [ ] New stars load when moving far
- [ ] Status shows "Viewing X stars from Gaia DR3"

**If all checked: You're streaming live astronomical data! 🎉**

---

## 🎯 Quick Backend Test

Open new terminal:

```powershell
cd d:\space\backend
python test_simple.py
```

Should output:

```
🧪 Testing Space Catalog API...
1. Testing health endpoint...
   Status: 200
   ✅ SUCCESS!

2. Testing Gaia DR3 query...
   Querying galactic center...
   ✅ SUCCESS!
   Stars returned: 50
   Query time: 1234.56ms

🎉 All tests passed! Live Gaia DR3 integration working!
```

---

## 📊 Performance Check

Watch console for query times:

```
First query:  1500ms ← Querying ESA
Second query: 15ms   ← From cache (100x faster!)
```

**Normal Performance:**

- First query to region: 1-3 seconds
- Cached queries: 5-20ms
- Rendering: 60 FPS
- Star count per load: 1000-5000

---

## 🎓 What to Look For

### Good Signs:

✅ RA/Dec values changing as you move  
✅ Query cache hits after revisiting regions  
✅ Smooth 60fps rendering  
✅ Varied star colors (not all white)  
✅ Star density varies by region  
✅ Console shows Gaia DR3 queries

### Bad Signs:

❌ "Using test data" in console  
❌ All stars white/same color  
❌ Star count never changes  
❌ No RA/Dec coordinates shown  
❌ "Failed to load" errors  
❌ Backend connection errors

---

## 🌌 Cool Things to Try

### 1. Fast Travel Test

- Hold W for 20 seconds
- Watch console for multiple queries
- See different stars in each region

### 2. Cache Test

- Move to position A
- Note the stars
- Move to position B
- Return to position A
- Should be instant (cached!)

### 3. Color Test

- Look for blue stars (hot regions)
- Look for red stars (cool regions)
- Compare to old CSV version

### 4. API Direct Test

Open in browser:

```
http://localhost:5000/api/stars/region?ra=266.4&dec=-29.0&radius=5&limit=50
```

Should return JSON with star data!

---

**Everything working? Congratulations! You're now exploring space with real ESA Gaia DR3 data! 🚀**
