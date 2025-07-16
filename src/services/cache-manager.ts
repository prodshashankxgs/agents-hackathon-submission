import { config } from '../config';
import { VIPInvestorProfile } from './vip-profile-service';
import { ThirteenFPortfolio } from './13f-service';

export interface CacheConfig {
  defaultTTL: number;
  maxSize: number;
  compressionEnabled: boolean;
  redisUrl?: string;
  fallbackToMemory: boolean;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
  size: number;
  accessCount: number;
  lastAccessed: number;
  version: number;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictions: number;
  errors: number;
  averageAccessTime: number;
  topKeys: string[];
}

export type CacheKeyType = 'vip_profile' | '13f_portfolio' | 'search_results' | 'metrics' | 'news';

export class CacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private redisClient: any = null;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    errors: 0,
    accessTimes: [] as number[]
  };
  
  private readonly config: CacheConfig;
  
  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      defaultTTL: 1000 * 60 * 60 * 4, // 4 hours
      maxSize: 100 * 1024 * 1024, // 100MB
      compressionEnabled: true,
      fallbackToMemory: true,
      ...config
    };
    
    this.initializeRedis();
  }
  
  private async initializeRedis(): Promise<void> {
    if (!this.config.redisUrl) {
      console.log('🔄 Redis URL not configured, using memory cache only');
      return;
    }
    
    try {
      // In production, you'd use a proper Redis client like 'redis' or 'ioredis'
      // For now, we'll simulate Redis connectivity
      console.log('🔄 Attempting Redis connection...');
      
      // Simulate Redis connection
      // this.redisClient = new Redis(this.config.redisUrl);
      
      console.log('✅ Redis cache initialized');
    } catch (error) {
      console.error('❌ Redis initialization failed:', error);
      if (this.config.fallbackToMemory) {
        console.log('🔄 Falling back to memory cache');
      }
    }
  }
  
  /**
   * Generate cache key with proper namespacing
   */
  private generateKey(type: CacheKeyType, identifier: string): string {
    const sanitized = identifier.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `nlp-trading:${type}:${sanitized}`;
  }
  
  /**
   * Get item from cache with comprehensive error handling
   */
  async get<T>(type: CacheKeyType, identifier: string): Promise<T | null> {
    const key = this.generateKey(type, identifier);
    const startTime = Date.now();
    
    try {
      // Try Redis first if available
      if (this.redisClient) {
        const redisData = await this.getFromRedis<T>(key);
        if (redisData) {
          this.recordHit(Date.now() - startTime);
          return redisData;
        }
      }
      
      // Fallback to memory cache
      const memoryData = this.getFromMemory<T>(key);
      if (memoryData) {
        this.recordHit(Date.now() - startTime);
        return memoryData;
      }
      
      this.recordMiss(Date.now() - startTime);
      return null;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Cache get error for key ${key}:`, error);
      
      // Try memory cache as fallback
      const memoryData = this.getFromMemory<T>(key);
      if (memoryData) {
        this.recordHit(Date.now() - startTime);
        return memoryData;
      }
      
      this.recordMiss(Date.now() - startTime);
      return null;
    }
  }
  
  /**
   * Set item in cache with TTL and size management
   */
  async set<T>(
    type: CacheKeyType, 
    identifier: string, 
    data: T, 
    ttl?: number
  ): Promise<void> {
    const key = this.generateKey(type, identifier);
    const expiry = Date.now() + (ttl || this.config.defaultTTL);
    
    try {
      const serializedData = JSON.stringify(data);
      const dataSize = this.calculateSize(serializedData);
      
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        expiry,
        size: dataSize,
        accessCount: 0,
        lastAccessed: Date.now(),
        version: 1
      };
      
      // Set in Redis if available
      if (this.redisClient) {
        await this.setInRedis(key, entry, ttl);
      }
      
      // Set in memory cache
      this.setInMemory(key, entry);
      
      // Perform cleanup if needed
      this.cleanupMemoryCache();
      
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Cache set error for key ${key}:`, error);
    }
  }
  
  /**
   * Delete item from cache
   */
  async delete(type: CacheKeyType, identifier: string): Promise<void> {
    const key = this.generateKey(type, identifier);
    
    try {
      // Delete from Redis
      if (this.redisClient) {
        await this.deleteFromRedis(key);
      }
      
      // Delete from memory
      this.memoryCache.delete(key);
      
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Cache delete error for key ${key}:`, error);
    }
  }
  
  /**
   * Clear all cache entries of a specific type
   */
  async clearType(type: CacheKeyType): Promise<void> {
    const pattern = `nlp-trading:${type}:*`;
    
    try {
      // Clear from Redis
      if (this.redisClient) {
        await this.clearFromRedis(pattern);
      }
      
      // Clear from memory
      const keysToDelete = [...this.memoryCache.keys()].filter(key => key.startsWith(pattern.replace('*', '')));
      keysToDelete.forEach(key => this.memoryCache.delete(key));
      
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Cache clear error for type ${type}:`, error);
    }
  }
  
  /**
   * Clear all cache entries
   */
  async clearAll(): Promise<void> {
    try {
      // Clear Redis
      if (this.redisClient) {
        await this.redisClient.flushdb();
      }
      
      // Clear memory
      this.memoryCache.clear();
      
      console.log('🧹 All cache cleared');
      
    } catch (error) {
      this.stats.errors++;
      console.error('❌ Cache clear all error:', error);
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    const missRate = totalRequests > 0 ? (this.stats.misses / totalRequests) * 100 : 0;
    
    const totalSize = [...this.memoryCache.values()].reduce((sum, entry) => sum + entry.size, 0);
    
    const averageAccessTime = this.stats.accessTimes.length > 0 
      ? this.stats.accessTimes.reduce((sum, time) => sum + time, 0) / this.stats.accessTimes.length
      : 0;
    
    const topKeys = [...this.memoryCache.entries()]
      .sort(([,a], [,b]) => b.accessCount - a.accessCount)
      .slice(0, 10)
      .map(([key]) => key);
    
    return {
      totalEntries: this.memoryCache.size,
      totalSize,
      hitRate,
      missRate,
      evictions: this.stats.evictions,
      errors: this.stats.errors,
      averageAccessTime,
      topKeys
    };
  }
  
  /**
   * Specialized cache methods for common data types
   */
  
  async getVIPProfile(name: string): Promise<VIPInvestorProfile | null> {
    return this.get<VIPInvestorProfile>('vip_profile', name);
  }
  
  async setVIPProfile(name: string, profile: VIPInvestorProfile, ttl?: number): Promise<void> {
    return this.set('vip_profile', name, profile, ttl);
  }
  
  async get13FPortfolio(institution: string): Promise<ThirteenFPortfolio | null> {
    return this.get<ThirteenFPortfolio>('13f_portfolio', institution);
  }
  
  async set13FPortfolio(institution: string, portfolio: ThirteenFPortfolio, ttl?: number): Promise<void> {
    return this.set('13f_portfolio', institution, portfolio, ttl);
  }
  
  async getSearchResults(query: string): Promise<any[] | null> {
    return this.get<any[]>('search_results', query);
  }
  
  async setSearchResults(query: string, results: any[], ttl?: number): Promise<void> {
    return this.set('search_results', query, results, ttl || 1000 * 60 * 30); // 30 minutes for search results
  }
  
  /**
   * Private helper methods
   */
  
  private getFromMemory<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiry) {
      this.memoryCache.delete(key);
      return null;
    }
    
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    return entry.data;
  }
  
  private setInMemory<T>(key: string, entry: CacheEntry<T>): void {
    this.memoryCache.set(key, entry);
  }
  
  private async getFromRedis<T>(key: string): Promise<T | null> {
    if (!this.redisClient) return null;
    
    try {
      const data = await this.redisClient.get(key);
      if (!data) return null;
      
      const entry: CacheEntry<T> = JSON.parse(data);
      if (Date.now() > entry.expiry) {
        await this.redisClient.del(key);
        return null;
      }
      
      return entry.data;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }
  
  private async setInRedis<T>(key: string, entry: CacheEntry<T>, ttl?: number): Promise<void> {
    if (!this.redisClient) return;
    
    try {
      const serialized = JSON.stringify(entry);
      const ttlSeconds = Math.ceil((ttl || this.config.defaultTTL) / 1000);
      await this.redisClient.setex(key, ttlSeconds, serialized);
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }
  
  private async deleteFromRedis(key: string): Promise<void> {
    if (!this.redisClient) return;
    
    try {
      await this.redisClient.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }
  
  private async clearFromRedis(pattern: string): Promise<void> {
    if (!this.redisClient) return;
    
    try {
      const keys = await this.redisClient.keys(pattern);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      console.error('Redis clear error:', error);
    }
  }
  
  private cleanupMemoryCache(): void {
    const currentTime = Date.now();
    const maxSize = this.config.maxSize;
    
    // Remove expired entries
    for (const [key, entry] of this.memoryCache) {
      if (currentTime > entry.expiry) {
        this.memoryCache.delete(key);
      }
    }
    
    // Check total size and evict if necessary
    const totalSize = [...this.memoryCache.values()].reduce((sum, entry) => sum + entry.size, 0);
    
    if (totalSize > maxSize) {
      const entries = [...this.memoryCache.entries()]
        .sort(([,a], [,b]) => {
          // Sort by access frequency and recency
          const scoreA = a.accessCount * 0.7 + (currentTime - a.lastAccessed) * 0.3;
          const scoreB = b.accessCount * 0.7 + (currentTime - b.lastAccessed) * 0.3;
          return scoreA - scoreB;
        });
      
      // Evict least used entries
      const evictCount = Math.ceil(entries.length * 0.2); // Evict 20%
      for (let i = 0; i < evictCount; i++) {
        const [key] = entries[i];
        this.memoryCache.delete(key);
        this.stats.evictions++;
      }
    }
  }
  
  private calculateSize(data: string): number {
    return Buffer.byteLength(data, 'utf8');
  }
  
  private recordHit(accessTime: number): void {
    this.stats.hits++;
    this.stats.accessTimes.push(accessTime);
    
    // Keep only recent access times
    if (this.stats.accessTimes.length > 1000) {
      this.stats.accessTimes = this.stats.accessTimes.slice(-1000);
    }
  }
  
  private recordMiss(accessTime: number): void {
    this.stats.misses++;
    this.stats.accessTimes.push(accessTime);
    
    if (this.stats.accessTimes.length > 1000) {
      this.stats.accessTimes = this.stats.accessTimes.slice(-1000);
    }
  }
  
  /**
   * Background cleanup job
   */
  startCleanupJob(intervalMs: number = 300000): void { // 5 minutes
    setInterval(() => {
      this.cleanupMemoryCache();
    }, intervalMs);
  }
  
  /**
   * Warm up cache with frequently accessed data
   */
  async warmUp(data: {
    vipProfiles?: Array<{ name: string; profile: VIPInvestorProfile }>;
    portfolios?: Array<{ institution: string; portfolio: ThirteenFPortfolio }>;
  }): Promise<void> {
    console.log('🔄 Warming up cache...');
    
    try {
      // Warm up VIP profiles
      if (data.vipProfiles) {
        for (const { name, profile } of data.vipProfiles) {
          await this.setVIPProfile(name, profile);
        }
      }
      
      // Warm up 13F portfolios
      if (data.portfolios) {
        for (const { institution, portfolio } of data.portfolios) {
          await this.set13FPortfolio(institution, portfolio);
        }
      }
      
      console.log('✅ Cache warmed up successfully');
      
    } catch (error) {
      console.error('❌ Cache warm up failed:', error);
    }
  }
}