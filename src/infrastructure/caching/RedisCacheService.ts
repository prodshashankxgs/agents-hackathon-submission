// ============================================================================
// REDIS CACHE SERVICE - INFRASTRUCTURE LAYER
// ============================================================================

import { 
  ICacheService, 
  InfrastructureError,
  ILogger
} from '../../core/interfaces';

// Note: For now, we'll implement an in-memory version that can be easily 
// swapped for Redis when needed. This maintains the interface contract.

export class RedisCacheService implements ICacheService {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 30000; // 30 seconds

  constructor(private logger: ILogger) {
    this.logger.info('RedisCacheService initialized (in-memory mode)');
    
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      this.cleanup();
    }, 300000);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = this.cache.get(key);
      
      if (!entry) {
        this.logger.debug('Cache miss', { key });
        return null;
      }

      // Check if entry has expired
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        this.logger.debug('Cache entry expired', { key });
        return null;
      }

      this.logger.debug('Cache hit', { key });
      return entry.value as T;

    } catch (error) {
      this.logger.error('Cache get operation failed', error as Error, { key });
      throw new InfrastructureError(
        `Failed to get cache entry: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CACHE_GET_FAILED',
        'Redis',
        { key, originalError: error }
      );
    }
  }

  async set<T>(key: string, value: T, ttl: number = this.DEFAULT_TTL): Promise<void> {
    try {
      const entry: CacheEntry = {
        value,
        createdAt: Date.now()
      };
      
      if (ttl > 0) {
        entry.expiresAt = Date.now() + ttl;
      }
      
      this.cache.set(key, entry);

      this.logger.debug('Cache entry set', { key, ttl, hasExpiration: !!entry.expiresAt });

    } catch (error) {
      this.logger.error('Cache set operation failed', error as Error, { key });
      throw new InfrastructureError(
        `Failed to set cache entry: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CACHE_SET_FAILED',
        'Redis',
        { key, originalError: error }
      );
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const existed = this.cache.has(key);
      this.cache.delete(key);
      
      this.logger.debug('Cache entry deleted', { key, existed });
      return existed;

    } catch (error) {
      this.logger.error('Cache delete operation failed', error as Error, { key });
      throw new InfrastructureError(
        `Failed to delete cache entry: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CACHE_DELETE_FAILED',
        'Redis',
        { key, originalError: error }
      );
    }
  }

  async clear(): Promise<void> {
    try {
      const count = this.cache.size;
      this.cache.clear();
      
      this.logger.info('Cache cleared', { entriesRemoved: count });

    } catch (error) {
      this.logger.error('Cache clear operation failed', error as Error);
      throw new InfrastructureError(
        `Failed to clear cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CACHE_CLEAR_FAILED',
        'Redis',
        { originalError: error }
      );
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const entry = this.cache.get(key);
      
      if (!entry) {
        return false;
      }

      // Check if entry has expired
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return false;
      }

      return true;

    } catch (error) {
      this.logger.error('Cache has operation failed', error as Error, { key });
      return false; // Return false instead of throwing for existence check
    }
  }

  // ===== CACHE-SPECIFIC METHODS =====

  /**
   * Get multiple cache entries at once
   */
  async getMultiple<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    
    for (const key of keys) {
      try {
        const value = await this.get<T>(key);
        results.set(key, value);
      } catch (error) {
        this.logger.warn('Failed to get cache entry in batch operation', { error: error as Error, key });
        results.set(key, null);
      }
    }
    
    return results;
  }

  /**
   * Set multiple cache entries at once
   */
  async setMultiple<T>(entries: Map<string, T>, ttl: number = this.DEFAULT_TTL): Promise<void> {
    const promises = Array.from(entries.entries()).map(([key, value]) => 
      this.set(key, value, ttl).catch(error => {
        this.logger.warn('Failed to set cache entry in batch operation', { error: error as Error, key });
      })
    );
    
    await Promise.all(promises);
  }

  /**
   * Delete multiple cache entries at once
   */
  async deleteMultiple(keys: string[]): Promise<number> {
    let deletedCount = 0;
    
    for (const key of keys) {
      try {
        const deleted = await this.delete(key);
        if (deleted) deletedCount++;
      } catch (error) {
        this.logger.warn('Failed to delete cache entry in batch operation', { error: error as Error, key });
      }
    }
    
    return deletedCount;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    let expiredCount = 0;
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        expiredCount++;
      }
      
      // Rough size estimation
      totalSize += JSON.stringify({ key, value: entry.value }).length;
    }
    
    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      activeEntries: this.cache.size - expiredCount,
      estimatedSizeBytes: totalSize,
      hitRate: 0, // Would need to track hits/misses for this
      missRate: 0
    };
  }

  /**
   * Create a cache key with namespace
   */
  createKey(namespace: string, identifier: string, ...parts: string[]): string {
    const allParts = [namespace, identifier, ...parts].filter(Boolean);
    return allParts.join(':');
  }

  /**
   * Get keys matching a pattern (simplified version)
   */
  async getKeys(pattern: string): Promise<string[]> {
    try {
      const keys = Array.from(this.cache.keys());
      
      if (pattern === '*') {
        return keys;
      }
      
      // Simple pattern matching (replace with proper regex if needed)
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return keys.filter(key => regex.test(key));

    } catch (error) {
      this.logger.error('Failed to get keys matching pattern', error as Error, { pattern });
      return [];
    }
  }

  /**
   * Set cache entry with tags for easier invalidation
   */
  async setWithTags<T>(key: string, value: T, tags: string[], ttl: number = this.DEFAULT_TTL): Promise<void> {
    // Store the main entry
    await this.set(key, value, ttl);
    
    // Store tag mappings for easier invalidation
    for (const tag of tags) {
      const tagKey = this.createKey('tags', tag);
      let taggedKeys = await this.get<string[]>(tagKey) || [];
      
      if (!taggedKeys.includes(key)) {
        taggedKeys.push(key);
        await this.set(tagKey, taggedKeys, ttl);
      }
    }
  }

  /**
   * Invalidate all cache entries with specific tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let totalDeleted = 0;
    
    for (const tag of tags) {
      const tagKey = this.createKey('tags', tag);
      const taggedKeys = await this.get<string[]>(tagKey) || [];
      
      if (taggedKeys.length > 0) {
        const deleted = await this.deleteMultiple(taggedKeys);
        totalDeleted += deleted;
        
        // Remove the tag entry itself
        await this.delete(tagKey);
      }
    }
    
    this.logger.info('Cache entries invalidated by tags', { tags, totalDeleted });
    return totalDeleted;
  }

  // ===== PRIVATE METHODS =====

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.debug('Cache cleanup completed', { cleanedCount });
    }
  }
}

// ===== SUPPORTING TYPES =====

interface CacheEntry {
  value: any;
  expiresAt?: number;
  createdAt: number;
}

export interface CacheStats {
  totalEntries: number;
  expiredEntries: number;
  activeEntries: number;
  estimatedSizeBytes: number;
  hitRate: number;
  missRate: number;
}

// ===== REAL REDIS IMPLEMENTATION (COMMENTED FOR FUTURE USE) =====
/*
import Redis from 'ioredis';

export class RealRedisCacheService implements ICacheService {
  private redis: Redis;

  constructor(private logger: ILogger, redisUrl?: string) {
    this.redis = new Redis(redisUrl || 'redis://localhost:6379');
    this.logger.info('Redis cache service initialized');
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.error('Redis get failed', error as Error, { key });
      throw new InfrastructureError('Cache get failed', 'CACHE_GET_FAILED', 'Redis');
    }
  }

  async set<T>(key: string, value: T, ttl: number = 30000): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await this.redis.setex(key, Math.ceil(ttl / 1000), serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      this.logger.error('Redis set failed', error as Error, { key });
      throw new InfrastructureError('Cache set failed', 'CACHE_SET_FAILED', 'Redis');
    }
  }

  // ... implement other methods
}
*/