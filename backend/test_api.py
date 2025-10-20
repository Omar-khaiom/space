"""
Test script to verify Gaia DR3 integration
Run this to test the backend API
"""
import requests
import json
import time

BASE_URL = "http://localhost:5000"

def test_health():
    """Test health endpoint"""
    print("\n🔍 Testing /health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(json.dumps(response.json(), indent=2))

def test_galactic_center():
    """Test quick galactic center query"""
    print("\n🌌 Testing /api/stars/galactic-center endpoint...")
    print("Querying Sagittarius A* region (may take 30-60 seconds)...")
    
    start = time.time()
    response = requests.get(
        f"{BASE_URL}/api/stars/galactic-center",
        params={"radius": 2.0, "max_stars": 5000}
    )
    duration = time.time() - start
    
    print(f"Status: {response.status_code}")
    print(f"Query time: {duration:.2f}s")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Stars found: {data['count']}")
        print(f"Cached: {data['cached']}")
        
        if data['count'] > 0:
            star = data['stars'][0]
            print("\n📍 First star sample:")
            print(f"  ID: {star['id']}")
            print(f"  Position: ({star['x']:.2f}, {star['y']:.2f}, {star['z']:.2f}) parsecs")
            print(f"  RA/DEC: ({star['ra']:.4f}°, {star['dec']:.4f}°)")
            print(f"  Distance: {star['distance_pc']:.2f} parsecs")
            print(f"  Magnitude: {star['magnitude']:.2f}")
            print(f"  Color RGB: ({star['r']:.2f}, {star['g']:.2f}, {star['b']:.2f})")
            print(f"  Temperature: {star['temperature']} K" if star['temperature'] else "  Temperature: N/A")

def test_cone_query():
    """Test custom cone search"""
    print("\n🎯 Testing /api/stars/cone endpoint...")
    print("Querying Orion Nebula region...")
    
    start = time.time()
    response = requests.post(
        f"{BASE_URL}/api/stars/cone",
        json={
            "ra": 83.8,  # Orion Nebula
            "dec": -5.4,
            "radius": 1.0,
            "max_stars": 1000,
            "min_magnitude": 15.0
        }
    )
    duration = time.time() - start
    
    print(f"Status: {response.status_code}")
    print(f"Query time: {duration:.2f}s")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Stars found: {data['count']}")
        print(f"Cached: {data['cached']}")

if __name__ == "__main__":
    print("=" * 60)
    print("SPACE CATALOG API - TEST SUITE")
    print("=" * 60)
    
    try:
        # Test 1: Health check
        test_health()
        
        # Test 2: Galactic center (real Gaia query)
        test_galactic_center()
        
        # Test 3: Custom cone query
        test_cone_query()
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS COMPLETED")
        print("=" * 60)
        print("\n💡 Next step: Update frontend to use this API!")
        print("   Open http://localhost:5000/docs for interactive API")
        
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Cannot connect to backend!")
        print("   Make sure the server is running: python app.py")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
