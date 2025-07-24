import { MarketData } from '../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface ParsedIntent {
  input: string;
  intent: any;
  timestamp: number;
}

export class CacheService {
  private marketDataCache = new Map<string, CacheEntry<MarketData>>();
  private intentCache = new Map<string, ParsedIntent>();
  private validationCache = new Map<string, CacheEntry<any>>();
  private accountInfoCache: CacheEntry<any> | null = null;
  private genericCache = new Map<string, CacheEntry<any>>();
  
  private readonly DEFAULT_TTL = 30000; // 30 seconds
  private readonly INTENT_TTL = 300000; // 5 minutes
  private readonly VALIDATION_TTL = 60000; // 1 minute
  private readonly ACCOUNT_TTL = 120000; // 2 minutes
  
  // Intelligent TTL based on market conditions
  private readonly MARKET_HOURS_TTL = 15000; // 15 seconds during market hours
  private readonly AFTER_HOURS_TTL = 300000; // 5 minutes after hours
  private readonly WEEKEND_TTL = 3600000; // 1 hour on weekends

  /**
   * Get cached market data
   */
  getMarketData(symbol: string): MarketData | null {
    const entry = this.marketDataCache.get(symbol);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.marketDataCache.delete(symbol);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Cache market data with intelligent TTL based on market conditions
   */
  setMarketData(symbol: string, data: MarketData, ttl?: number): void {
    const intelligentTTL = ttl || this.calculateIntelligentTTL(data.isMarketOpen);
    
    this.marketDataCache.set(symbol, {
      data,
      timestamp: Date.now(),
      ttl: intelligentTTL
    });
  }

  /**
   * Calculate intelligent TTL based on market conditions
   */
  private calculateIntelligentTTL(isMarketOpen: boolean): number {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Weekend - use longer TTL
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return this.WEEKEND_TTL;
    }
    
    // Weekday - check if market is open
    if (isMarketOpen) {
      return this.MARKET_HOURS_TTL;
    } else {
      return this.AFTER_HOURS_TTL;
    }
  }

  /**
   * Get cached parsed intent by input hash
   */
  getParsedIntent(inputHash: string): any | null {
    const entry = this.intentCache.get(inputHash);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.INTENT_TTL) {
      this.intentCache.delete(inputHash);
      return null;
    }
    
    return entry.intent;
  }

  /**
   * Cache parsed intent with input hash
   */
  setParsedIntent(inputHash: string, input: string, intent: any): void {
    this.intentCache.set(inputHash, {
      input,
      intent,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached validation result
   */
  getValidation(validationKey: string): any | null {
    const entry = this.validationCache.get(validationKey);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.validationCache.delete(validationKey);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Cache validation result
   */
  setValidation(validationKey: string, data: any, ttl: number = this.VALIDATION_TTL): void {
    this.validationCache.set(validationKey, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Get cached account info
   */
  getAccountInfo(): any | null {
    if (!this.accountInfoCache) return null;
    
    if (Date.now() - this.accountInfoCache.timestamp > this.accountInfoCache.ttl) {
      this.accountInfoCache = null;
      return null;
    }
    
    return this.accountInfoCache.data;
  }

  /**
   * Cache account info
   */
  setAccountInfo(data: any, ttl: number = this.ACCOUNT_TTL): void {
    this.accountInfoCache = {
      data,
      timestamp: Date.now(),
      ttl
    };
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    this.marketDataCache.clear();
    this.intentCache.clear();
    this.validationCache.clear();
    this.genericCache.clear();
    this.accountInfoCache = null;
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    
    // Clear expired market data
    for (const [symbol, entry] of this.marketDataCache) {
      if (now - entry.timestamp > entry.ttl) {
        this.marketDataCache.delete(symbol);
      }
    }
    
    // Clear expired intents
    for (const [hash, entry] of this.intentCache) {
      if (now - entry.timestamp > this.INTENT_TTL) {
        this.intentCache.delete(hash);
      }
    }
    
    // Clear expired validations
    for (const [key, entry] of this.validationCache) {
      if (now - entry.timestamp > entry.ttl) {
        this.validationCache.delete(key);
      }
    }
    
    // Clear expired generic cache entries
    for (const [key, entry] of this.genericCache) {
      if (now - entry.timestamp > entry.ttl) {
        this.genericCache.delete(key);
      }
    }
    
    // Clear expired account info
    if (this.accountInfoCache && now - this.accountInfoCache.timestamp > this.accountInfoCache.ttl) {
      this.accountInfoCache = null;
    }
  }

  /**
   * Create hash from string for caching
   */
  createHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Cache warming - preload popular symbols
   */
  async warmCache(symbols: string[], dataFetcher: (symbol: string) => Promise<MarketData>): Promise<void> {
    const warmingPromises = symbols.map(async (symbol) => {
      try {
        if (!this.getMarketData(symbol)) {
          const data = await dataFetcher(symbol);
          this.setMarketData(symbol, data);
        }
      } catch (error) {
        console.warn(`Failed to warm cache for ${symbol}:`, error);
      }
    });

    await Promise.allSettled(warmingPromises);
  }

  /**
   * Invalidate cache on market events
   */
  invalidateMarketData(symbols?: string[]): void {
    if (symbols) {
      symbols.forEach(symbol => this.marketDataCache.delete(symbol));
    } else {
      this.marketDataCache.clear();
    }
  }

  /**
   * Get cache hit ratio for performance monitoring
   */
  getHitRatio(): {
    marketData: { hits: number; misses: number; ratio: number };
    intents: { hits: number; misses: number; ratio: number };
  } {
    // This would require tracking hits/misses - simplified version
    return {
      marketData: { hits: 0, misses: 0, ratio: 0 },
      intents: { hits: 0, misses: 0, ratio: 0 }
    };
  }

  /**
   * Generic cache getter
   */
  get<T>(key: string): T | null {
    const entry = this.genericCache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.genericCache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Generic cache setter
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.genericCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    marketData: number;
    intents: number;
    validations: number;
    generic: number;
    accountInfo: boolean;
    memoryUsage: number;
  } {
    // Estimate memory usage (simplified)
    const marketDataSize = this.marketDataCache.size * 1024; // ~1KB per entry
    const intentSize = this.intentCache.size * 512; // ~512B per entry
    const validationSize = this.validationCache.size * 256; // ~256B per entry
    const genericSize = this.genericCache.size * 512; // ~512B per entry
    
    return {
      marketData: this.marketDataCache.size,
      intents: this.intentCache.size,
      validations: this.validationCache.size,
      generic: this.genericCache.size,
      accountInfo: this.accountInfoCache !== null,
      memoryUsage: marketDataSize + intentSize + validationSize + genericSize
    };
  }
}

// Global cache instance
export const cacheService = new CacheService();

// Auto-cleanup expired entries every 5 minutes
setInterval(() => {
  cacheService.clearExpired();
}, 300000);