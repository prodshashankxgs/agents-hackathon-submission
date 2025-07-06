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
  
  private readonly DEFAULT_TTL = 30000; // 30 seconds
  private readonly INTENT_TTL = 300000; // 5 minutes
  private readonly VALIDATION_TTL = 60000; // 1 minute
  private readonly ACCOUNT_TTL = 120000; // 2 minutes

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
   * Cache market data with TTL
   */
  setMarketData(symbol: string, data: MarketData, ttl: number = this.DEFAULT_TTL): void {
    this.marketDataCache.set(symbol, {
      data,
      timestamp: Date.now(),
      ttl
    });
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
   * Get cache statistics
   */
  getStats(): {
    marketData: number;
    intents: number;
    validations: number;
    accountInfo: boolean;
  } {
    return {
      marketData: this.marketDataCache.size,
      intents: this.intentCache.size,
      validations: this.validationCache.size,
      accountInfo: this.accountInfoCache !== null
    };
  }
}

// Global cache instance
export const cacheService = new CacheService();

// Auto-cleanup expired entries every 5 minutes
setInterval(() => {
  cacheService.clearExpired();
}, 300000);