"""Simple test to verify API is working"""
import requests
import sys

print("🧪 Testing Space Catalog API...")
print("=" * 60)

try:
    # Test health
    print("\n1. Testing health endpoint...")
    r = requests.get("http://localhost:5000/api/health", timeout=5)
    print(f"   Status: {r.status_code}")
    print(f"   Response: {r.json()}")
    
    # Test Gaia query
    print("\n2. Testing Gaia DR3 query...")
    print("   Querying galactic center (ra=266.4, dec=-29, radius=5°)...")
    params = {
        "ra": 266.4168,
        "dec": -29.0078,
        "radius": 5.0,
        "limit": 50
    }
    r = requests.get("http://localhost:5000/api/stars/region", params=params, timeout=30)
    print(f"   Status: {r.status_code}")
    
    if r.status_code == 200:
        data = r.json()
        print(f"   ✅ SUCCESS!")
        print(f"   Stars returned: {data['count']}")
        print(f"   Query time: {data['query_time_ms']:.2f}ms")
        print(f"   Cached: {data['cached']}")
        
        if data['stars']:
            star = data['stars'][0]
            print(f"\n   Sample star:")
            print(f"     RA/Dec: {star['ra']:.4f}, {star['dec']:.4f}")
            print(f"     Magnitude: {star.get('magnitude', 'N/A')}")
            print(f"     Distance: {star.get('distance_pc', 'N/A')} parsecs")
    else:
        print(f"   ❌ FAILED: {r.text}")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("🎉 All tests passed! Live Gaia DR3 integration working!")
    
except requests.exceptions.ConnectionError:
    print("\n❌ ERROR: Cannot connect to API. Is the server running?")
    print("   Start it with: cd d:\\space\\backend && python -m uvicorn app:app --reload --port 5000")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ ERROR: {e}")
    sys.exit(1)
