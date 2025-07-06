import { MarketDataBatchProcessor } from './batch-processor';
import { cacheService } from '../cache/cache-service';

/**
 * Optimized market data fetcher with batching and caching
 */
export class OptimizedMarketDataService {
  private batchProcessor: MarketDataBatchProcessor;
  private pendingRequests = new Map<string, Promise<any>>();

  constructor() {
    this.batchProcessor = new MarketDataBatchProcessor();
  }

  /**
   * Get market data with request deduplication
   */
  async getMarketData(symbol: string, fetcher: (symbol: string) => Promise<any>): Promise<any> {
    // Check cache first
    const cached = cacheService.getMarketData(symbol);
    if (cached) {
      return cached;
    }

    // Check if request is already pending
    const existingRequest = this.pendingRequests.get(symbol);
    if (existingRequest) {
      return existingRequest;
    }

    // Create new request
    const request = this.fetchAndCache(symbol, fetcher);
    this.pendingRequests.set(symbol, request);

    try {
      const result = await request;
      return result;
    } finally {
      this.pendingRequests.delete(symbol);
    }
  }

  private async fetchAndCache(symbol: string, fetcher: (symbol: string) => Promise<any>): Promise<any> {
    try {
      const data = await fetcher(symbol);
      
      // Cache the result
      const ttl = data.isMarketOpen ? 30000 : 300000; // 30s if open, 5min if closed
      cacheService.setMarketData(symbol, data, ttl);
      
      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Batch fetch multiple symbols
   */
  async batchGetMarketData(
    symbols: string[], 
    fetcher: (symbol: string) => Promise<any>
  ): Promise<Map<string, any>> {
    // Filter out cached symbols
    const uncachedSymbols: string[] = [];
    const results = new Map<string, any>();

    for (const symbol of symbols) {
      const cached = cacheService.getMarketData(symbol);
      if (cached) {
        results.set(symbol, cached);
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    // Batch fetch uncached symbols
    if (uncachedSymbols.length > 0) {
      const batchResults = await this.batchProcessor.fetchMarketDataBatch(
        uncachedSymbols,
        async (symbol) => {
          const data = await fetcher(symbol);
          const ttl = data.isMarketOpen ? 30000 : 300000;
          cacheService.setMarketData(symbol, data, ttl);
          return data;
        }
      );

      // Merge batch results
      for (const [symbol, data] of batchResults) {
        results.set(symbol, data);
      }
    }

    return results;
  }
}

/**
 * Circuit breaker for external API calls
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private maxFailures: number = 5,
    private timeoutMs: number = 60000, // 1 minute
    private retryTimeoutMs: number = 30000 // 30 seconds
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.retryTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await Promise.race([
        operation(),
        this.timeout()
      ]);

      // Success - reset circuit breaker
      this.failures = 0;
      this.state = 'closed';
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.maxFailures) {
        this.state = 'open';
      }

      throw error;
    }
  }

  private async timeout(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), this.timeoutMs);
    });
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'closed';
  }
}

/**
 * Request debouncer to prevent spam
 */
export class RequestDebouncer {
  private timeouts = new Map<string, NodeJS.Timeout>();

  debounce<T>(
    key: string,
    operation: () => Promise<T>,
    delayMs: number = 300
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Clear existing timeout
      const existingTimeout = this.timeouts.get(key);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set new timeout
      const timeout = setTimeout(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.timeouts.delete(key);
        }
      }, delayMs);

      this.timeouts.set(key, timeout);
    });
  }

  cancel(key: string): void {
    const timeout = this.timeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(key);
    }
  }

  cancelAll(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
  }
}

// Global instances
export const marketDataService = new OptimizedMarketDataService();
export const apiCircuitBreaker = new CircuitBreaker();
export const requestDebouncer = new RequestDebouncer();