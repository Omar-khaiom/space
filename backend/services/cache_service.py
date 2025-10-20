"""
In-memory and SQLite caching service
Caches Gaia query results to reduce API load
"""
from typing import Optional, Dict, List, Any
import json
import hashlib
import time
from pathlib import Path
from loguru import logger
import aiosqlite

from config import settings


class CacheService:
    """Simple caching service with TTL support"""
    
    def __init__(self):
        self.memory_cache: Dict[str, Dict[str, Any]] = {}
        # Database path for SQLite cache
        self.db_path = getattr(settings, "CACHE_DB_PATH", "cache.db")
        self.enabled = settings.CACHE_ENABLED
        self.ttl = settings.CACHE_TTL_SECONDS
        
    async def initialize(self):
        """Initialize SQLite cache database"""
        if not self.enabled:
            return
            
        # Ensure parent directory exists if a path was provided
        try:
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS query_cache (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    timestamp REAL NOT NULL
                )
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_timestamp 
                ON query_cache(timestamp)
            """)
            await db.commit()
        
        logger.info("Cache service initialized")
    
    def _generate_key(self, query_params: Dict) -> str:
        """Generate cache key from query parameters"""
        # Sort keys for consistent hashing
        sorted_params = json.dumps(query_params, sort_keys=True)
        return hashlib.sha256(sorted_params.encode()).hexdigest()
    
    async def get(self, query_params: Dict) -> Optional[List[Dict]]:
        """Get cached query result"""
        if not self.enabled:
            return None
        
        key = self._generate_key(query_params)
        current_time = time.time()
        
        # Check memory cache first
        if key in self.memory_cache:
            cached = self.memory_cache[key]
            if current_time - cached['timestamp'] < self.ttl:
                logger.debug(f"Cache HIT (memory): {key[:16]}...")
                return cached['value']
            else:
                # Expired
                del self.memory_cache[key]
        
        # Check SQLite cache
        try:
            async with aiosqlite.connect(self.db_path) as db:
                async with db.execute(
                    "SELECT value, timestamp FROM query_cache WHERE key = ?",
                    (key,)
                ) as cursor:
                    row = await cursor.fetchone()
                    
                    if row:
                        value_json, timestamp = row
                        if current_time - timestamp < self.ttl:
                            value = json.loads(value_json)
                            # Promote to memory cache
                            self.memory_cache[key] = {
                                'value': value,
                                'timestamp': timestamp
                            }
                            logger.debug(f"Cache HIT (db): {key[:16]}...")
                            return value
                        else:
                            # Expired - delete
                            await db.execute(
                                "DELETE FROM query_cache WHERE key = ?",
                                (key,)
                            )
                            await db.commit()
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
        
        logger.debug(f"Cache MISS: {key[:16]}...")
        return None
    
    async def set(self, query_params: Dict, value: List[Dict]):
        """Store query result in cache"""
        if not self.enabled:
            return
        
        key = self._generate_key(query_params)
        timestamp = time.time()
        
        # Store in memory
        self.memory_cache[key] = {
            'value': value,
            'timestamp': timestamp
        }
        
        # Store in SQLite
        try:
            value_json = json.dumps(value)
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    "INSERT OR REPLACE INTO query_cache (key, value, timestamp) VALUES (?, ?, ?)",
                    (key, value_json, timestamp)
                )
                await db.commit()
            
            logger.debug(f"Cached query result: {key[:16]}... ({len(value)} stars)")
        except Exception as e:
            logger.warning(f"Cache write error: {e}")
    
    async def clear_expired(self):
        """Remove expired cache entries"""
        if not self.enabled:
            return
        
        current_time = time.time()
        cutoff = current_time - self.ttl
        
        # Clear memory cache
        expired_keys = [
            k for k, v in self.memory_cache.items()
            if v['timestamp'] < cutoff
        ]
        for key in expired_keys:
            del self.memory_cache[key]
        
        # Clear SQLite cache
        try:
            async with aiosqlite.connect(self.db_path) as db:
                result = await db.execute(
                    "DELETE FROM query_cache WHERE timestamp < ?",
                    (cutoff,)
                )
                await db.commit()
                deleted = result.rowcount
                
                if deleted > 0:
                    logger.info(f"Cleared {deleted} expired cache entries")
        except Exception as e:
            logger.warning(f"Cache cleanup error: {e}")
    
    async def stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        stats = {
            'enabled': self.enabled,
            'memory_entries': len(self.memory_cache),
            'db_entries': 0,
            'ttl_seconds': self.ttl
        }
        
        try:
            async with aiosqlite.connect(self.db_path) as db:
                async with db.execute("SELECT COUNT(*) FROM query_cache") as cursor:
                    row = await cursor.fetchone()
                    stats['db_entries'] = row[0] if row else 0
        except:
            pass
        
        return stats

    async def clear_all(self):
        """Completely clear cache (memory + db)."""
        self.memory_cache.clear()
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("DELETE FROM query_cache")
                await db.commit()
        except Exception as e:
            logger.warning(f"Cache clear_all error: {e}")


# Global cache instance
cache_service = CacheService()
