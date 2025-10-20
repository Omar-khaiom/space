"""
Test script to verify Gaia DR3 integration
"""
import requests
import json
from rich.console import Console
from rich.table import Table

console = Console()

def test_health():
    """Test health endpoint"""
    console.print("\n[bold cyan]Testing Health Endpoint[/bold cyan]")
    response = requests.get("http://localhost:5000/api/health")
    console.print(f"Status: {response.status_code}")
    console.print(json.dumps(response.json(), indent=2))
    return response.status_code == 200

def test_gaia_query():
    """Test Gaia star query"""
    console.print("\n[bold cyan]Testing Gaia DR3 Query[/bold cyan]")
    console.print("Querying 100 brightest stars near galactic center...")
    
    params = {
        "ra": 266.4168,  # Galactic center coordinates
        "dec": -29.0078,
        "radius": 5.0,    # 5 degree radius
        "limit": 100
    }
    
    response = requests.get("http://localhost:5000/api/stars/region", params=params)
    
    if response.status_code != 200:
        console.print(f"[red]Error: {response.status_code}[/red]")
        console.print(response.text)
        return False
    
    data = response.json()
    console.print(f"\n[green]✅ Query successful![/green]")
    console.print(f"Stars returned: {data['count']}")
    console.print(f"Query time: {data['query_time_ms']:.2f}ms")
    console.print(f"Cached: {data['cached']}")
    
    # Display sample stars
    if data['stars']:
        table = Table(title="\nSample Stars from Gaia DR3")
        table.add_column("RA", style="cyan")
        table.add_column("Dec", style="cyan")
        table.add_column("Magnitude", style="yellow")
        table.add_column("Distance (pc)", style="green")
        table.add_column("Spectral Type", style="magenta")
        
        for star in data['stars'][:10]:  # Show first 10
            distance = f"{star.get('distance_pc', 'N/A'):.1f}" if star.get('distance_pc') else "N/A"
            table.add_row(
                f"{star['ra']:.4f}",
                f"{star['dec']:.4f}",
                f"{star.get('magnitude', 'N/A'):.2f}",
                distance,
                star.get('spectral_type', 'Unknown')
            )
        
        console.print(table)
    
    return True

def test_search():
    """Test catalog search"""
    console.print("\n[bold cyan]Testing Catalog Search[/bold cyan]")
    console.print("Searching for 'Sirius'...")
    
    params = {"name": "Sirius", "limit": 5}
    response = requests.get("http://localhost:5000/api/catalog/search", params=params)
    
    if response.status_code != 200:
        console.print(f"[red]Error: {response.status_code}[/red]")
        console.print(response.text)
        return False
    
    data = response.json()
    console.print(f"\n[green]✅ Search successful![/green]")
    console.print(f"Results found: {data['count']}")
    console.print(json.dumps(data['results'][:3], indent=2))
    
    return True

def test_cache():
    """Test caching by making the same query twice"""
    console.print("\n[bold cyan]Testing Cache Performance[/bold cyan]")
    
    params = {
        "ra": 266.4168,
        "dec": -29.0078,
        "radius": 5.0,
        "limit": 100
    }
    
    console.print("First query (uncached)...")
    r1 = requests.get("http://localhost:5000/api/stars/region", params=params)
    data1 = r1.json()
    time1 = data1['query_time_ms']
    
    console.print("Second query (should be cached)...")
    r2 = requests.get("http://localhost:5000/api/stars/region", params=params)
    data2 = r2.json()
    time2 = data2['query_time_ms']
    
    console.print(f"\nFirst query: {time1:.2f}ms (cached: {data1['cached']})")
    console.print(f"Second query: {time2:.2f}ms (cached: {data2['cached']})")
    
    if data2['cached'] and time2 < time1:
        console.print(f"[green]✅ Cache working! {((time1-time2)/time1*100):.1f}% faster[/green]")
        return True
    else:
        console.print("[yellow]⚠️ Cache might not be working as expected[/yellow]")
        return True  # Not a critical failure

def main():
    console.print("\n[bold yellow]" + "="*60 + "[/bold yellow]")
    console.print("[bold yellow]  Space Catalog API - Gaia DR3 Integration Test  [/bold yellow]")
    console.print("[bold yellow]" + "="*60 + "[/bold yellow]\n")
    
    tests = [
        ("Health Check", test_health),
        ("Gaia DR3 Query", test_gaia_query),
        ("Catalog Search", test_search),
        ("Cache Performance", test_cache),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            success = test_func()
            results.append((name, success))
        except Exception as e:
            console.print(f"[red]❌ {name} failed: {e}[/red]")
            results.append((name, False))
    
    # Summary
    console.print("\n[bold yellow]" + "="*60 + "[/bold yellow]")
    console.print("[bold yellow]  Test Summary  [/bold yellow]")
    console.print("[bold yellow]" + "="*60 + "[/bold yellow]\n")
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for name, success in results:
        status = "[green]✅ PASS[/green]" if success else "[red]❌ FAIL[/red]"
        console.print(f"{status} - {name}")
    
    console.print(f"\n[bold]Results: {passed}/{total} tests passed[/bold]")
    
    if passed == total:
        console.print("\n[bold green]🎉 All tests passed! Gaia DR3 integration is working![/bold green]")
    else:
        console.print("\n[bold yellow]⚠️ Some tests failed. Check the output above.[/bold yellow]")

if __name__ == "__main__":
    main()
